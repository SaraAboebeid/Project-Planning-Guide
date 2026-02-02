import streamlit as st
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from datetime import datetime, timedelta
import random

# Page configuration
st.set_page_config(page_title="Project Planner", layout="wide")

# Wizard state for stepped navigation
if "wizard_step" not in st.session_state:
    st.session_state.wizard_step = 0  # 0 = intro, 1..6 = steps

# ==================== CONFIGURATION & RULES ENGINE ====================

# Detailed data requirements by analysis type (maps to specific data item keys)
ANALYSIS_DATA_REQUIREMENTS = {
    "Energy & Carbon Performance": {
        "required_items": [
            # Building Geometry
            "building_footprints",           # Footprint, height, number of floors
            "number_of_floors",              # Height, number of floors
            "roof_shape_angle",              # Roof shape and angle
            "window_to_wall_ratio",          # Window-to-wall ratio (per façade)
            # Location & Context
            "building_location",             # Building coordinates / address
            # Climate Data
            "climate_data",                  # Weather file (EPW / TMY / future climate)
            # Building Fabric & Construction (required)
            "building_materials",            # Wall, roof, floor, window constructions
            "construction_age",              # Year of construction (if materials unknown)
            # Building Use & Operation
            "building_use_type",             # Building use type
            "occupancy_data",                # Occupancy profiles
            "internal_gains",                # Internal gains (lighting, equipment)
            "dhw_demand",                    # Domestic hot water demand
            # Systems & Technologies (required)
            "hvac_systems",                  # HVAC system type
            "infiltration_rate",             # Infiltration rate
            # Carbon Accounting (if emissions reported)
            "emission_factors",              # Emission factors for electricity and heating supply
            # Energy Data
            "hourly_heating_demand",         # Hourly/monthly heating demand
            "hourly_electricity_consumption" # Hourly/monthly electricity use
        ],
        "optional_items": [
            "surroundings_data",             # Surrounding shading (if available)
            "window_properties",             # Specific window properties
            "architectural_drawings"         # More detailed geometry
        ]
    },
    "Renewable Energy & Local Production": {
        "required_items": [
            # Building Geometry
            "roof_shape_angle",              # Roof geometry (tilt, azimuth, usable area)
            "roof_area",                     # Usable roof area
            # Location & Context
            "surroundings_data",             # Shading from surrounding buildings/trees
            # Climate Data
            "climate_data",                  # Solar radiation (from EPW)
            # Systems & Technologies - PV system parameters
            "pv_system_params",              # Panel efficiency, installed capacity, coverage ratio, inverter efficiency
            # Building Use & Operation
            "occupancy_data",                # Hourly demand profiles
            # Energy Data
            "hourly_electricity_consumption" # Measured load profiles (improves self-consumption analysis)
        ],
        "optional_items": [
            "building_footprints",           # Building footprint for context
            "building_location",             # Building coordinates
            "battery_storage"                # Battery parameters (if storage included)
        ]
    },
    "Climate Resilience": {
        "required_items": [
            # Climate Data
            "climate_data",                  # Current weather file
            "future_climate_data",           # Future climate files (SSP/RCP scenarios)
            # Building Geometry
            "building_orientation",          # Orientation
            "window_to_wall_ratio",          # Window ratios
            "surroundings_data",             # Shading geometry
            # Building Fabric & Construction
            "thermal_mass",                  # Thermal mass
            "building_materials",            # Insulation levels
            "window_properties",             # Window properties
            # Building Use & Operation
            "occupancy_data",                # Occupancy schedules
            "comfort_thresholds",            # Comfort thresholds
            # Systems & Technologies
            "cooling_systems",               # Cooling systems (if present)
            "ventilation_strategy"           # Ventilation strategy
        ],
        "optional_items": [
            "building_footprints",           # Building footprint for context
            "construction_age",              # Building age for vulnerability assessment
            "hvac_systems"                   # Full HVAC details
        ]
    }
}

# Data requirements by analysis type
ANALYSIS_REQUIREMENTS = {
    "Energy & Carbon Performance": {
        "critical_data": ["building_footprints", "energy_consumption", "building_materials"],
        "important_data": ["construction_age", "climate_data", "hvac_systems"],
        "base_confidence": 70,
        "scale_preference": ["Building", "Neighborhood", "City"]
    },
    "Renewable Energy & Local Production": {
        "critical_data": ["building_footprints", "climate_data", "energy_consumption"],
        "important_data": ["roof_area", "solar_potential", "occupancy_data"],
        "base_confidence": 65,
        "scale_preference": ["Building", "Neighborhood", "City"]
    },
    "Retrofit & Transformation": {
        "critical_data": ["building_footprints", "construction_age", "energy_consumption", "building_materials"],
        "important_data": ["hvac_systems", "occupancy_data", "cost_data"],
        "base_confidence": 65,
        "scale_preference": ["Building", "Neighborhood"]
    },
    "Urban Design Support": {
        "critical_data": ["building_footprints", "urban_context", "land_use"],
        "important_data": ["climate_data", "infrastructure_data", "demographic_data"],
        "base_confidence": 70,
        "scale_preference": ["Neighborhood", "City"]
    },
    "Climate Resilience": {
        "critical_data": ["building_footprints", "climate_data", "vulnerability_data"],
        "important_data": ["construction_age", "building_materials", "flood_risk"],
        "base_confidence": 65,
        "scale_preference": ["Building", "Neighborhood", "City"]
    },
    "Infrastructure Planning": {
        "critical_data": ["building_footprints", "infrastructure_data", "energy_consumption"],
        "important_data": ["occupancy_data", "climate_data", "cost_data"],
        "base_confidence": 70,
        "scale_preference": ["Neighborhood", "City"]
    },
    "Equity & Social Impact": {
        "critical_data": ["building_footprints", "demographic_data", "accessibility_data"],
        "important_data": ["energy_consumption", "cost_data", "health_data"],
        "base_confidence": 65,
        "scale_preference": ["Building", "Neighborhood", "City"]
    }
}

# Data items with integrated proxy options
DATA_ITEMS_WITH_PROXIES = {
    "Building Geometry": [
        {
            'label': 'Architectural drawings',
            'key': 'architectural_drawings',
            'proxy_tiers': {
                'tier1': {
                    'name': 'Google Earth + Street View measurements',
                    'description': 'Extract dimensions from satellite imagery and street-level photos',
                    'confidence_impact': -15,
                    'uncertainty': 'Medium'
                },
                'tier2': {
                    'name': 'Neighboring building averages',
                    'description': 'Use average dimensions from similar nearby buildings',
                    'confidence_impact': -30,
                    'uncertainty': 'High'
                }
            }
        },
        {
            'label': 'Building dimensions',
            'key': 'building_footprints',
            'proxy_tiers': {
                'tier1': {
                    'name': 'GIS cadastral data',
                    'description': 'Use building footprints from cadastral/property records',
                    'confidence_impact': -10,
                    'uncertainty': 'Medium'
                },
                'tier2': {
                    'name': 'OpenStreetMap data',
                    'description': 'Extract building outlines from OpenStreetMap',
                    'confidence_impact': -25,
                    'uncertainty': 'High'
                }
            }
        },
        {
            'label': 'Number of floors',
            'key': 'number_of_floors',
            'proxy_tiers': {
                'tier1': {
                    'name': 'Visual estimation from imagery',
                    'description': 'Count floors from Google Street View or site photos',
                    'confidence_impact': -12,
                    'uncertainty': 'Medium'
                }
            }
        },
        {
            'label': 'Roof shape and roof angle',
            'key': 'roof_shape_angle',
            'proxy_tiers': {
                'tier1': {
                    'name': 'Aerial imagery analysis',
                    'description': 'Determine roof characteristics from satellite/drone imagery',
                    'confidence_impact': -15,
                    'uncertainty': 'Medium'
                }
            }
        },
        {
            'label': 'Window to wall ratio (all facades)',
            'key': 'window_to_wall_ratio',
            'proxy_tiers': {
                'tier1': {
                    'name': 'Photo analysis estimation',
                    'description': 'Estimate WWR from building facade photos',
                    'confidence_impact': -20,
                    'uncertainty': 'Medium-High'
                },
                'tier2': {
                    'name': 'Building type defaults',
                    'description': 'Apply typical WWR values for building type and age',
                    'confidence_impact': -35,
                    'uncertainty': 'High'
                }
            }
        },
        {
            'label': 'Building orientation',
            'key': 'building_orientation',
            'proxy_tiers': {
                'tier1': {
                    'name': 'GIS/Map-based measurement',
                    'description': 'Calculate orientation from map data or satellite imagery',
                    'confidence_impact': -5,
                    'uncertainty': 'Low'
                }
            }
        }
    ],
    "Building Fabric and Construction": [
        {
            'label': 'Construction materials',
            'key': 'building_materials',
            'proxy_tiers': {
                'tier1': {
                    'name': 'National construction standards by decade',
                    'description': 'Use typical construction practices from national building codes',
                    'confidence_impact': -20,
                    'uncertainty': 'Medium'
                },
                'tier2': {
                    'name': 'Thermal imaging sample extrapolation',
                    'description': 'Extrapolate from thermal imaging survey of representative buildings',
                    'confidence_impact': -25,
                    'uncertainty': 'Medium-High'
                },
                'tier3': {
                    'name': 'Climate zone defaults',
                    'description': 'Apply typical envelope values for climate zone',
                    'confidence_impact': -40,
                    'uncertainty': 'High'
                }
            }
        },
        {
            'label': 'Year of construction/renovation',
            'key': 'construction_age',
            'proxy_tiers': {
                'tier1': {
                    'name': 'Municipal building permits',
                    'description': 'Obtain construction dates from building permit archives',
                    'confidence_impact': -8,
                    'uncertainty': 'Low-Medium'
                },
                'tier2': {
                    'name': 'Architectural style dating',
                    'description': 'Estimate age from architectural characteristics and local development patterns',
                    'confidence_impact': -25,
                    'uncertainty': 'High'
                },
                'tier3': {
                    'name': 'Regional average by area',
                    'description': 'Apply average building age from regional statistics',
                    'confidence_impact': -35,
                    'uncertainty': 'High'
                }
            }
        },
        {
            'label': 'Windows properties',
            'key': 'window_properties',
            'proxy_tiers': {
                'tier1': {
                    'name': 'Age-based window standards',
                    'description': 'Infer window properties from construction age and building codes',
                    'confidence_impact': -18,
                    'uncertainty': 'Medium'
                }
            }
        },
        {
            'label': 'Thermal mass',
            'key': 'thermal_mass',
            'proxy_tiers': {
                'tier1': {
                    'name': 'Construction type estimation',
                    'description': 'Estimate thermal mass from building type and construction era',
                    'confidence_impact': -20,
                    'uncertainty': 'Medium-High'
                },
                'tier2': {
                    'name': 'Generic thermal mass values',
                    'description': 'Apply standard thermal mass values for building category',
                    'confidence_impact': -35,
                    'uncertainty': 'High'
                }
            }
        }
    ],
    "Building System": [
        {
            'label': 'HVAC system type',
            'key': 'hvac_systems',
            'proxy_tiers': {
                'tier1': {
                    'name': 'Age-based system assumptions',
                    'description': 'Infer HVAC type from building age and type',
                    'confidence_impact': -20,
                    'uncertainty': 'Medium-High'
                },
                'tier2': {
                    'name': 'Regional typical systems',
                    'description': 'Apply most common system types for region',
                    'confidence_impact': -35,
                    'uncertainty': 'High'
                }
            }
        },
        {
            'label': 'Infiltration rate',
            'key': 'infiltration_rate',
            'proxy_tiers': {
                'tier1': {
                    'name': 'Building age defaults',
                    'description': 'Use typical infiltration rates based on construction period',
                    'confidence_impact': -15,
                    'uncertainty': 'Medium'
                }
            }
        },
        {
            'label': 'Cooling systems',
            'key': 'cooling_systems',
            'proxy_tiers': {
                'tier1': {
                    'name': 'Climate zone typical systems',
                    'description': 'Infer cooling system type based on climate and building age',
                    'confidence_impact': -18,
                    'uncertainty': 'Medium'
                },
                'tier2': {
                    'name': 'Regional cooling standards',
                    'description': 'Apply typical cooling solutions for region',
                    'confidence_impact': -30,
                    'uncertainty': 'High'
                }
            }
        },
        {
            'label': 'Ventilation strategy',
            'key': 'ventilation_strategy',
            'proxy_tiers': {
                'tier1': {
                    'name': 'Building type defaults',
                    'description': 'Assume typical ventilation for building type and age',
                    'confidence_impact': -20,
                    'uncertainty': 'Medium-High'
                }
            }
        }
    ],
    "Location Context": [
        {
            'label': 'Buildings location',
            'key': 'building_location',
            'proxy_tiers': {
                'tier1': {
                    'name': 'Address geocoding',
                    'description': 'Convert addresses to coordinates using geocoding services',
                    'confidence_impact': -5,
                    'uncertainty': 'Low'
                }
            }
        },
        {
            'label': 'Surroundings height and location',
            'key': 'surroundings_data',
            'proxy_tiers': {
                'tier1': {
                    'name': '3D city model or LiDAR',
                    'description': 'Use available 3D building data or aerial LiDAR scans',
                    'confidence_impact': -12,
                    'uncertainty': 'Medium'
                },
                'tier2': {
                    'name': 'Simplified shading analysis',
                    'description': 'Estimate shading using 2D maps and typical building heights',
                    'confidence_impact': -25,
                    'uncertainty': 'High'
                }
            }
        }
    ],
    "Measured Energy Data": [
        {
            'label': 'Hourly heating demand',
            'key': 'hourly_heating_demand',
            'proxy_tiers': {
                'tier1': {
                    'name': 'Monthly/annual utility data',
                    'description': 'Use monthly utility bills with load profile estimation',
                    'confidence_impact': -20,
                    'uncertainty': 'Medium-High'
                },
                'tier2': {
                    'name': 'Benchmark data by building type',
                    'description': 'Apply typical heating profiles from similar buildings',
                    'confidence_impact': -35,
                    'uncertainty': 'High'
                },
                'tier3': {
                    'name': 'Physics-based simulation',
                    'description': 'Calculate heating demand from building model and weather',
                    'confidence_impact': -50,
                    'uncertainty': 'Very High'
                }
            }
        },
        {
            'label': 'Hourly electricity consumption',
            'key': 'hourly_electricity_consumption',
            'proxy_tiers': {
                'tier1': {
                    'name': 'Monthly/annual utility data',
                    'description': 'Use monthly utility bills with load profile estimation',
                    'confidence_impact': -18,
                    'uncertainty': 'Medium-High'
                },
                'tier2': {
                    'name': 'Benchmark load profiles',
                    'description': 'Apply standard electricity profiles for building type',
                    'confidence_impact': -40,
                    'uncertainty': 'High'
                }
            }
        }
    ],
    "Climate Data": [
        {
            'label': 'Weather file (EPW/TMY)',
            'key': 'climate_data',
            'proxy_tiers': {
                'tier1': {
                    'name': 'Nearby weather station data',
                    'description': 'Use weather data from nearest meteorological station',
                    'confidence_impact': -8,
                    'uncertainty': 'Low-Medium'
                },
                'tier2': {
                    'name': 'Climate zone typical year',
                    'description': 'Use typical meteorological year for climate zone',
                    'confidence_impact': -20,
                    'uncertainty': 'Medium-High'
                }
            }
        },
        {
            'label': 'Future climate scenarios (SSP/RCP)',
            'key': 'future_climate_data',
            'proxy_tiers': {
                'tier1': {
                    'name': 'Regional climate projections',
                    'description': 'Use downscaled regional climate model projections',
                    'confidence_impact': -15,
                    'uncertainty': 'Medium'
                },
                'tier2': {
                    'name': 'Morphed weather files',
                    'description': 'Apply climate change factors to current weather data',
                    'confidence_impact': -30,
                    'uncertainty': 'High'
                }
            }
        }
    ],
    "Carbon Accounting": [
        {
            'label': 'Emission factors for energy carriers',
            'key': 'emission_factors',
            'proxy_tiers': {
                'tier1': {
                    'name': 'National grid emission factors',
                    'description': 'Use national/regional emission factors from official sources',
                    'confidence_impact': -10,
                    'uncertainty': 'Low-Medium'
                },
                'tier2': {
                    'name': 'Default IPCC factors',
                    'description': 'Apply generic IPCC emission factors',
                    'confidence_impact': -25,
                    'uncertainty': 'High'
                }
            }
        },
        {
            'label': 'Roof area / solar potential',
            'key': 'roof_area',
            'proxy_tiers': {
                'tier1': {
                    'name': 'Aerial imagery estimation',
                    'description': 'Calculate roof area from satellite/aerial imagery',
                    'confidence_impact': -10,
                    'uncertainty': 'Medium'
                }
            }
        },
        {
            'label': 'Solar potential assessment',
            'key': 'solar_potential',
            'proxy_tiers': {
                'tier1': {
                    'name': 'GIS-based solar mapping',
                    'description': 'Use available solar potential maps or calculations',
                    'confidence_impact': -15,
                    'uncertainty': 'Medium'
                }
            }
        }
    ],
    "Renewable Energy Systems": [
        {
            'label': 'PV system parameters',
            'key': 'pv_system_params',
            'proxy_tiers': {
                'tier1': {
                    'name': 'Regional typical PV systems',
                    'description': 'Use typical panel efficiency, inverter specs for region',
                    'confidence_impact': -15,
                    'uncertainty': 'Medium'
                },
                'tier2': {
                    'name': 'Generic PV system defaults',
                    'description': 'Apply standard industry defaults for PV systems',
                    'confidence_impact': -30,
                    'uncertainty': 'High'
                }
            }
        },
        {
            'label': 'Battery storage parameters',
            'key': 'battery_storage',
            'proxy_tiers': {
                'tier1': {
                    'name': 'Standard battery system specs',
                    'description': 'Use typical battery capacity and efficiency values',
                    'confidence_impact': -20,
                    'uncertainty': 'Medium-High'
                }
            }
        }
    ],
    "Building Use and Operation": [
        {
            'label': 'Building use type',
            'key': 'building_use_type',
            'proxy_tiers': {
                'tier1': {
                    'name': 'Municipal zoning records',
                    'description': 'Obtain building use classification from zoning database',
                    'confidence_impact': -8,
                    'uncertainty': 'Low'
                }
            }
        },
        {
            'label': 'Occupancy patterns',
            'key': 'occupancy_data',
            'proxy_tiers': {
                'tier1': {
                    'name': 'Census data by building type',
                    'description': 'Use census occupancy statistics for building category',
                    'confidence_impact': -12,
                    'uncertainty': 'Medium'
                },
                'tier2': {
                    'name': 'Standard occupancy schedules',
                    'description': 'Apply typical occupancy patterns from standards (ASHRAE, ISO)',
                    'confidence_impact': -25,
                    'uncertainty': 'High'
                }
            }
        },
        {
            'label': 'Internal gains',
            'key': 'internal_gains',
            'proxy_tiers': {
                'tier1': {
                    'name': 'Building standard defaults',
                    'description': 'Use standard internal gain values from energy codes',
                    'confidence_impact': -15,
                    'uncertainty': 'Medium'
                }
            }
        },
        {
            'label': 'Domestic hot water demand',
            'key': 'dhw_demand',
            'proxy_tiers': {
                'tier1': {
                    'name': 'Occupancy-based estimation',
                    'description': 'Calculate DHW from occupancy and building standards',
                    'confidence_impact': -18,
                    'uncertainty': 'Medium'
                }
            }
        },
        {
            'label': 'Comfort thresholds',
            'key': 'comfort_thresholds',
            'proxy_tiers': {
                'tier1': {
                    'name': 'Standard comfort ranges',
                    'description': 'Apply ASHRAE/EN comfort standards for building type',
                    'confidence_impact': -12,
                    'uncertainty': 'Medium'
                },
                'tier2': {
                    'name': 'Climate-based defaults',
                    'description': 'Use typical comfort ranges for climate zone',
                    'confidence_impact': -25,
                    'uncertainty': 'High'
                }
            }
        }
    ]
}

# Legacy PROXY_TIERS for backward compatibility with confidence calculations
PROXY_TIERS = {
    "construction_age": {
        "tier1": {
            "name": "National typology by age period",
            "description": "Use national building archetypes categorized by construction period",
            "uncertainty": "Medium",
            "confidence_impact": -15,
            "suitable_for": ["Scenario Planning", "Retrofit Ranking"],
            "not_suitable_for": ["Detailed Analysis", "Individual Building Assessment"],
            "outputs_affected": ["Annual Energy Demand", "Retrofit Prioritization"]
        },
        "tier2": {
            "name": "Inferred age from remote sensing",
            "description": "Estimate building age using satellite imagery and urban growth patterns",
            "uncertainty": "High",
            "confidence_impact": -30,
            "suitable_for": ["Urban Screening", "Comparative Studies"],
            "not_suitable_for": ["Investment Decisions", "Detailed Analysis"],
            "outputs_affected": ["Annual Energy Demand", "Peak Power Load", "Cost Estimates"]
        },
        "tier3": {
            "name": "Regional averages",
            "description": "Apply average building age from regional statistics",
            "uncertainty": "High",
            "confidence_impact": -35,
            "suitable_for": ["Scenario Planning", "High-level Screening"],
            "not_suitable_for": ["Building-specific Analysis", "Investment Decisions"],
            "outputs_affected": ["Annual Energy Demand", "Retrofit Prioritization", "Cost Estimates"]
        }
    },
    "building_materials": {
        "tier1": {
            "name": "National construction standards by decade",
            "description": "Use typical construction practices from national building codes",
            "uncertainty": "Medium",
            "confidence_impact": -20,
            "suitable_for": ["Scenario Planning", "Comparative Analysis"],
            "not_suitable_for": ["Precise Thermal Modeling"],
            "outputs_affected": ["Annual Energy Demand", "Carbon Emissions"]
        },
        "tier2": {
            "name": "Thermal imaging sample extrapolation",
            "description": "Extrapolate from thermal imaging survey of representative buildings",
            "uncertainty": "Medium-High",
            "confidence_impact": -25,
            "suitable_for": ["Neighborhood Assessment", "Prioritization"],
            "not_suitable_for": ["Individual Building Analysis"],
            "outputs_affected": ["Annual Energy Demand", "Retrofit Prioritization"]
        },
        "tier3": {
            "name": "Climate zone defaults",
            "description": "Apply typical envelope values for climate zone",
            "uncertainty": "High",
            "confidence_impact": -40,
            "suitable_for": ["Rough Estimation Only"],
            "not_suitable_for": ["Most Practical Applications"],
            "outputs_affected": ["Annual Energy Demand", "Peak Power Load", "Carbon Emissions"]
        }
    },
    "energy_consumption": {
        "tier1": {
            "name": "Utility billing data aggregated",
            "description": "Use aggregated utility data for area or building type",
            "uncertainty": "Medium",
            "confidence_impact": -10,
            "suitable_for": ["Neighborhood Analysis", "Baseline Assessment"],
            "not_suitable_for": ["Peak Load Analysis", "Individual Buildings"],
            "outputs_affected": ["Annual Energy Demand"]
        },
        "tier2": {
            "name": "Benchmark data by building type",
            "description": "Apply energy use intensity benchmarks from similar buildings",
            "uncertainty": "High",
            "confidence_impact": -35,
            "suitable_for": ["Initial Screening", "Comparative Studies"],
            "not_suitable_for": ["Accurate Energy Modeling"],
            "outputs_affected": ["Annual Energy Demand", "Carbon Emissions", "Cost Estimates"]
        },
        "tier3": {
            "name": "Simulated estimates",
            "description": "Calculate from building physics and assumptions",
            "uncertainty": "Very High",
            "confidence_impact": -50,
            "suitable_for": ["Scenario Comparison Only"],
            "not_suitable_for": ["Baseline Reporting", "Investment Decisions"],
            "outputs_affected": ["Annual Energy Demand", "Peak Power Load", "Carbon Emissions"]
        }
    },
    "occupancy_data": {
        "tier1": {
            "name": "Census data by building type",
            "description": "Use census occupancy statistics for building category",
            "uncertainty": "Medium",
            "confidence_impact": -12,
            "suitable_for": ["Load Profiling", "Demand Estimation"],
            "not_suitable_for": ["Hourly Load Curves"],
            "outputs_affected": ["Peak Power Load", "Annual Energy Demand"]
        },
        "tier2": {
            "name": "Standard occupancy schedules",
            "description": "Apply typical occupancy patterns from standards",
            "uncertainty": "High",
            "confidence_impact": -25,
            "suitable_for": ["Comparative Analysis", "Scenario Planning"],
            "not_suitable_for": ["Demand Response Planning"],
            "outputs_affected": ["Peak Power Load", "Annual Energy Demand"]
        }
    },
    "hvac_systems": {
        "tier1": {
            "name": "Age-based system assumptions",
            "description": "Infer HVAC type from building age and type",
            "uncertainty": "Medium-High",
            "confidence_impact": -20,
            "suitable_for": ["System-level Planning", "Retrofit Screening"],
            "not_suitable_for": ["Equipment Sizing"],
            "outputs_affected": ["Peak Power Load", "Annual Energy Demand", "Retrofit Prioritization"]
        },
        "tier2": {
            "name": "Regional typical systems",
            "description": "Apply most common system types for region",
            "uncertainty": "High",
            "confidence_impact": -35,
            "suitable_for": ["Initial Assessment Only"],
            "not_suitable_for": ["Detailed Energy Modeling"],
            "outputs_affected": ["Peak Power Load", "Annual Energy Demand", "Carbon Emissions"]
        }
    }
}

# Scale-specific requirements and considerations
SCALE_CONSIDERATIONS = {
    "Building": {
        "required_detail": "High",
        "aggregation_acceptable": False,
        "typical_outputs": ["Annual Energy Demand", "Peak Power Load", "Retrofit Prioritization"],
        "confidence_multiplier": 1.0,
        "message": "Building-scale analysis requires detailed, building-specific data for reliable results."
    },
    "Neighborhood": {
        "required_detail": "Medium",
        "aggregation_acceptable": True,
        "typical_outputs": ["Annual Energy Demand", "Peak Power Load", "Carbon Emissions", "Retrofit Prioritization"],
        "confidence_multiplier": 1.1,
        "message": "Neighborhood-scale analysis can tolerate some aggregated data and proxies."
    },
    "City": {
        "required_detail": "Medium-Low",
        "aggregation_acceptable": True,
        "typical_outputs": ["Annual Energy Demand", "Carbon Emissions", "Cost Estimates"],
        "confidence_multiplier": 1.2,
        "message": "City-scale analysis focuses on aggregate trends; individual building accuracy less critical."
    }
}

# Country-specific data quality adjustments
COUNTRY_DATA_QUALITY = {
    "Sweden": {"adjustment": 10, "note": "Excellent data infrastructure"},
    "Denmark": {"adjustment": 10, "note": "Excellent data infrastructure"},
    "Germany": {"adjustment": 5, "note": "Good data availability"},
    "Finland": {"adjustment": 8, "note": "Very good data availability"},
    "Norway": {"adjustment": 8, "note": "Very good data availability"},
    "United Kingdom": {"adjustment": 5, "note": "Good data availability"},
    "Belgium": {"adjustment": 3, "note": "Moderate data availability"},
    "France": {"adjustment": 3, "note": "Moderate data availability"},
    "Ireland": {"adjustment": 2, "note": "Moderate data availability"}
}

# Output-specific confidence calculation weights
OUTPUT_WEIGHTS = {
    "Annual Energy Demand": {
        "critical_data": ["energy_consumption", "building_footprints", "climate_data"],
        "important_data": ["construction_age", "building_materials"],
        "base_confidence": 70
    },
    "Peak Power Load": {
        "critical_data": ["energy_consumption", "occupancy_data", "hvac_systems"],
        "important_data": ["construction_age", "climate_data"],
        "base_confidence": 60
    },
    "Carbon Emissions": {
        "critical_data": ["energy_consumption", "building_materials", "hvac_systems"],
        "important_data": ["construction_age", "climate_data"],
        "base_confidence": 65
    },
    "Cost Estimates": {
        "critical_data": ["construction_age", "building_materials", "building_footprints"],
        "important_data": ["energy_consumption", "hvac_systems"],
        "base_confidence": 55
    },
    "Retrofit Prioritization": {
        "critical_data": ["construction_age", "building_footprints", "energy_consumption"],
        "important_data": ["building_materials", "hvac_systems"],
        "base_confidence": 70
    }
}

def get_filtered_data_items(analysis_types):
    """
    Filter DATA_ITEMS_WITH_PROXIES based on the selected analysis type(s).
    Returns only the data items relevant to the specified analysis/analyses.
    Merges requirements from multiple analyses without duplication.
    
    Args:
        analysis_types: Single analysis type string or list of analysis types
    
    Returns:
        dict: Filtered dictionary of data items organized by category
    """
    # Convert single string to list for uniform processing
    if isinstance(analysis_types, str):
        analysis_types = [analysis_types]
    
    # If no valid analysis types, return all items
    valid_types = [at for at in analysis_types if at in ANALYSIS_DATA_REQUIREMENTS]
    if not valid_types:
        return DATA_ITEMS_WITH_PROXIES
    
    # Merge requirements from all selected analysis types
    all_required_keys = set()
    all_optional_keys = set()
    item_to_analyses = {}  # Track which analyses need each item
    
    for analysis_type in valid_types:
        requirements = ANALYSIS_DATA_REQUIREMENTS[analysis_type]
        required = set(requirements["required_items"])
        optional = set(requirements.get("optional_items", []))
        
        all_required_keys.update(required)
        all_optional_keys.update(optional)
        
        # Track which analyses need each item
        for key in required:
            if key not in item_to_analyses:
                item_to_analyses[key] = {'required_in': [], 'optional_in': []}
            item_to_analyses[key]['required_in'].append(analysis_type)
        
        for key in optional:
            if key not in item_to_analyses:
                item_to_analyses[key] = {'required_in': [], 'optional_in': []}
            item_to_analyses[key]['optional_in'].append(analysis_type)
    
    # If item is required in ANY analysis, treat as required (not optional)
    all_optional_keys = all_optional_keys - all_required_keys
    all_needed_keys = all_required_keys | all_optional_keys
    
    # Filter data items by keeping only those in the merged requirements
    filtered_items = {}
    
    for category, items in DATA_ITEMS_WITH_PROXIES.items():
        filtered_category_items = []
        
        for item in items:
            if item['key'] in all_needed_keys:
                # Mark if it's required or optional (across all selected analyses)
                item_copy = item.copy()
                item_copy['is_required'] = item['key'] in all_required_keys
                item_copy['is_optional'] = item['key'] in all_optional_keys
                item_copy['analyses'] = item_to_analyses.get(item['key'], {'required_in': [], 'optional_in': []})
                filtered_category_items.append(item_copy)
        
        # Only include category if it has items
        if filtered_category_items:
            filtered_items[category] = filtered_category_items
    
    return filtered_items

def calculate_confidence(analysis_type, data_inputs, project_scale, country, desired_outputs):
    """
    Calculate confidence levels based on available data, proxies, analysis type, and scale.
    
    Returns: dict with confidence for each output and overall confidence
    """
    results = {}
    
    # Get base confidence for analysis type
    base_conf = ANALYSIS_REQUIREMENTS[analysis_type]["base_confidence"]
    
    # Apply scale multiplier
    scale_mult = SCALE_CONSIDERATIONS[project_scale]["confidence_multiplier"]
    
    # Apply country adjustment
    country_adj = COUNTRY_DATA_QUALITY[country]["adjustment"]
    
    # Calculate confidence for each desired output
    output_confidences = {}
    
    for output in desired_outputs:
        if output in OUTPUT_WEIGHTS:
            output_conf = OUTPUT_WEIGHTS[output]["base_confidence"]
            
            # Check critical data availability
            critical_data = OUTPUT_WEIGHTS[output]["critical_data"]
            critical_missing = sum(1 for d in critical_data if not data_inputs.get(d, False))
            critical_penalty = critical_missing * 20  # 20% penalty per missing critical item
            
            # Check important data availability
            important_data = OUTPUT_WEIGHTS[output]["important_data"]
            important_missing = sum(1 for d in important_data if not data_inputs.get(d, False))
            important_penalty = important_missing * 10  # 10% penalty per missing important item
            
            # Calculate final confidence
            final_conf = output_conf - critical_penalty - important_penalty
            final_conf = final_conf * scale_mult + country_adj
            final_conf = max(0, min(100, final_conf))  # Clamp between 0-100
            
            output_confidences[output] = round(final_conf)
    
    # Overall confidence is weighted average
    if output_confidences:
        overall_confidence = round(sum(output_confidences.values()) / len(output_confidences))
    else:
        overall_confidence = base_conf
    
    return {
        "overall": overall_confidence,
        "by_output": output_confidences,
        "scale_message": SCALE_CONSIDERATIONS[project_scale]["message"],
        "country_note": COUNTRY_DATA_QUALITY[country]["note"]
    }

def get_recommended_proxies(data_inputs, analysis_type, project_scale):
    """
    Determine which proxy tiers to recommend based on missing data and context.
    
    Returns: dict with recommended proxies for each missing data item
    """
    recommendations = {}
    
    # Get requirements for this analysis type
    requirements = ANALYSIS_REQUIREMENTS[analysis_type]
    critical_data = requirements["critical_data"]
    
    for data_item, is_available in data_inputs.items():
        if not is_available and data_item in PROXY_TIERS:
            # Determine best tier based on criticality and scale
            is_critical = data_item in critical_data
            
            if project_scale == "Building":
                # Building scale: prefer tier 1 or tier 2 for critical data
                recommended_tier = "tier1" if is_critical else "tier2"
            elif project_scale == "Neighborhood":
                # Neighborhood scale: tier 1 usually sufficient
                recommended_tier = "tier1"
            else:  # City
                # City scale: can tolerate tier 2 or even tier 3 for some items
                recommended_tier = "tier2" if is_critical else "tier3"
            
            proxy_info = PROXY_TIERS[data_item][recommended_tier].copy()
            proxy_info["is_critical"] = is_critical
            proxy_info["tier"] = recommended_tier
            recommendations[data_item] = proxy_info
    
    return recommendations

def get_analysis_messages(analysis_type, data_inputs, project_scale, confidence_score):
    """
    Generate context-specific messages and warnings based on the configuration.
    
    Returns: dict with messages, warnings, and recommendations
    """
    messages = {
        "warnings": [],
        "recommendations": [],
        "limitations": []
    }
    
    requirements = ANALYSIS_REQUIREMENTS[analysis_type]
    critical_data = requirements["critical_data"]
    
    # Check for missing critical data
    missing_critical = [d for d in critical_data if not data_inputs.get(d, False)]
    
    if missing_critical:
        for item in missing_critical:
            messages["warnings"].append(
                f"⚠ Critical data missing: {item.replace('_', ' ').title()}. "
                f"This significantly impacts {analysis_type} reliability."
            )
            messages["recommendations"].append(
                f"Priority: Obtain {item.replace('_', ' ')} data to improve confidence by 15-20%"
            )
    
    # Scale-specific messages
    if project_scale in requirements["scale_preference"]:
        messages["recommendations"].append(
            f"✓ {project_scale} scale is well-suited for {analysis_type}"
        )
    else:
        messages["warnings"].append(
            f"⚠ {analysis_type} typically performed at {' or '.join(requirements['scale_preference'])} scale"
        )
    
    # Confidence-based messages
    if confidence_score < 50:
        messages["limitations"].append(
            "⚠ Low confidence: Results should be used for screening purposes only"
        )
        messages["recommendations"].append(
            "Critical: Significant data improvements needed before proceeding"
        )
    elif confidence_score < 70:
        messages["limitations"].append(
            "⚠ Medium confidence: Results suitable for planning but not detailed design"
        )
        messages["recommendations"].append(
            "Recommended: Improve key data items to increase confidence above 70%"
        )
    else:
        messages["recommendations"].append(
            "✓ Good confidence level for proceeding with analysis"
        )
    
    return messages

# ===== Backend Structure: Effort, Timeline, and Cost Estimation =====

# Default consultant hourly rates by currency (adjust as needed)
CONSULTANT_RATES = {
    "USD": 150.0,
    "EUR": 140.0,
    "GBP": 130.0,
    "SEK": 1400.0,
    "NOK": 1500.0,
    "DKK": 1050.0,
}

# Base analysis effort (hours) for Building scale
EFFORT_BASE_HOURS = {
    "Energy & Carbon Performance": 60,
    "Renewable Energy & Local Production": 50,
    "Climate Resilience": 70,
    "Retrofit & Transformation": 65,
    "Urban Design Support": 55,
}

SCALE_EFFORT_MULTIPLIERS = {
    "Building": 1.0,
    "Neighborhood": 1.8,
    "City": 2.5,
}

PHASE_SPLIT = {
    "Scoping": 0.10,
    "Data Collection": 0.30,
    "Modeling": 0.35,
    "Validation": 0.15,
    "Reporting": 0.10,
}

def get_selected_uses_count() -> int:
    keys = [
        'use_residential','use_commercial','use_industrial','use_school',
        'use_hospital','use_sports','use_office','use_mixed_use'
    ]
    return sum(1 for k in keys if st.session_state.get(k, False))

def get_data_completeness_stats(analysis_types, data_inputs):
    filtered = get_filtered_data_items(analysis_types)
    total = sum(len(items) for items in filtered.values())
    available = sum(1 for items in filtered.values() for item in items if data_inputs.get(item['key'], False))
    pct = (available / total * 100.0) if total > 0 else 0.0
    return {"total": total, "available": available, "pct": pct}

def estimate_effort_and_timeline(analysis_type, project_scale, selected_uses_count, data_completeness_pct, proxies_count):
    base_hours = EFFORT_BASE_HOURS.get(analysis_type, 60)
    scale_mult = SCALE_EFFORT_MULTIPLIERS.get(project_scale, 1.0)

    # Complexity from building uses (Neighborhood/City only)
    uses_mult = 1.0
    if project_scale in ["Neighborhood", "City"]:
        uses_mult = 1.0 + max(0, selected_uses_count - 1) * 0.08

    # Data completeness impact (more missing → more effort)
    completeness_mult = 1.0 + (1.0 - (data_completeness_pct / 100.0)) * 0.7

    # Proxies add incremental effort
    proxy_mult = 1.0 + proxies_count * 0.03

    total_hours = base_hours * scale_mult * uses_mult * completeness_mult * proxy_mult

    # Split into phases
    breakdown = {phase: round(total_hours * frac) for phase, frac in PHASE_SPLIT.items()}

    # Duration estimate assuming 30 focused hours/week
    weekly_capacity = 30.0
    duration_weeks = max(1, round(total_hours / weekly_capacity))

    return {
        "hours_total": round(total_hours),
        "hours_breakdown": breakdown,
        "duration_weeks": duration_weeks,
    }

def estimate_cost(hours_total, currency):
    rate = st.session_state.get("consultant_rate", CONSULTANT_RATES.get(currency, 150.0))
    # Overhead factor for management and QA
    overhead_mult = 1.10
    return {
        "rate": rate,
        "estimated_service_cost": round(hours_total * rate * overhead_mult, 2),
        "overhead_mult": overhead_mult,
    }

# ===== Task Planner Helpers =====

def generate_suggested_tasks(total_hours: int, proxies_count: int, completeness_pct: float, analysis_type: str, project_scale: str):
    """Create a suggested task list with estimated hours and deliverables.
    Returns a list of dicts: {Task, Hours, Owner, Phase, Deliverable}.
    - If a specific analysis template exists, use absolute durations (scale-aware).
    - Otherwise, fall back to weighted distribution of total_hours.
    """
    weekly_capacity = 30.0  # hours per week

    # Specialized template for Renewable Energy & Local Production
    if analysis_type == "Renewable Energy & Local Production":
        # Scale factors (weeks) for core tasks
        if project_scale == "Building":
            weeks = {
                "Digital Model Setup": 1.0,
                "Roof & Usable Area Extraction": 0.5,
                "Solar Irradiance (Incident Radiation) Simulation": 1.0,
                "PV System Sizing & Layout": 0.5,
                "Energy Balance & Self-Consumption": 0.5,
                "Financial Analysis (CAPEX/OPEX)": 0.5,
                "Validation & QA": 0.5,
                "Reporting & Recommendations": 0.5,
            }
        elif project_scale == "Neighborhood":
            weeks = {
                "Digital Model Setup": 3.0,  # per user request
                "Roof & Usable Area Extraction": 1.0,
                "Solar Irradiance (Incident Radiation) Simulation": 2.0,
                "PV System Sizing & Layout": 1.0,
                "Energy Balance & Self-Consumption": 1.0,
                "Financial Analysis (CAPEX/OPEX)": 1.0,
                "Validation & QA": 0.5,
                "Reporting & Recommendations": 0.5,
            }
        else:  # City (approximate)
            weeks = {
                "Digital Model Setup": 4.0,
                "Roof & Usable Area Extraction": 2.0,
                "Solar Irradiance (Incident Radiation) Simulation": 3.0,
                "PV System Sizing & Layout": 1.5,
                "Energy Balance & Self-Consumption": 1.5,
                "Financial Analysis (CAPEX/OPEX)": 1.0,
                "Validation & QA": 0.5,
                "Reporting & Recommendations": 0.5,
            }

        # Data completeness/proxies can add a data wrangling task
        missing_factor = max(0.0, 1.0 - (completeness_pct / 100.0))
        wrangle_weeks = 0.0
        if missing_factor > 0.0 or proxies_count > 0:
            wrangle_weeks = 0.5 + 1.0 * missing_factor + 0.1 * min(proxies_count, 10)

        deliverables = {
            "Scoping & Kickoff": "Scope, success criteria, data checklist",
            "Digital Model Setup": "Clean GIS/BIM model suitable for solar analysis",
            "Data Wrangling & Gap Filling": "Curated dataset, proxy selections documented",
            "Roof & Usable Area Extraction": "Usable roof polygons, obstructions mapped",
            "Solar Irradiance (Incident Radiation) Simulation": "Annual/seasonal irradiance maps, kWh/m²",
            "PV System Sizing & Layout": "Preliminary PV layout, DC/AC sizing, inverter config",
            "Energy Balance & Self-Consumption": "Self-consumption ratio, grid import/export profile",
            "Financial Analysis (CAPEX/OPEX)": "CAPEX/OPEX, LCOE, payback, NPV",
            "Validation & QA": "Spot-checks vs known cases and sanity bounds",
            "Reporting & Recommendations": "Executive summary, results, actions, risks",
        }

        tasks = []
        # Scoping is small but useful
        tasks.append({
            "Task": "Scoping & Kickoff",
            "Hours": int(round(0.3 * weekly_capacity)),
            "Owner": "",
            "Phase": "Scoping",
            "Deliverable": deliverables["Scoping & Kickoff"],
        })
        # Optional data wrangling based on gaps
        if wrangle_weeks > 0:
            tasks.append({
                "Task": "Data Wrangling & Gap Filling",
                "Hours": int(round(wrangle_weeks * weekly_capacity)),
                "Owner": "",
                "Phase": "Data Collection",
                "Deliverable": deliverables["Data Wrangling & Gap Filling"],
            })
        # Core tasks
        core_phase_map = {
            "Digital Model Setup": "Modeling",
            "Roof & Usable Area Extraction": "Modeling",
            "Solar Irradiance (Incident Radiation) Simulation": "Modeling",
            "PV System Sizing & Layout": "Analysis",
            "Energy Balance & Self-Consumption": "Analysis",
            "Financial Analysis (CAPEX/OPEX)": "Analysis",
            "Validation & QA": "Validation",
            "Reporting & Recommendations": "Reporting",
        }
        for name, w in weeks.items():
            tasks.append({
                "Task": name,
                "Hours": int(round(w * weekly_capacity)),
                "Owner": "",
                "Phase": core_phase_map.get(name, "Modeling"),
                "Deliverable": deliverables.get(name, ""),
            })
        return tasks

    # Fallback: weighted distribution when no specific template exists
    weights = {
        "Scoping": 0.10,
        "Data Collection": 0.28,
        "Proxy Preparation": 0.10 if proxies_count > 0 else 0.04,
        "Model Setup & Simulation": 0.32,
        "Validation & QA": 0.12,
        "Reporting": 0.08,
    }

    if analysis_type in ["Climate Resilience", "Energy & Carbon Performance"]:
        weights["Model Setup & Simulation"] += 0.03
        weights["Data Collection"] -= 0.02
        weights["Validation & QA"] -= 0.01

    missing_factor = max(0.0, 1.0 - (completeness_pct / 100.0))
    weights["Data Collection"] += 0.10 * missing_factor
    weights["Proxy Preparation"] += (0.02 + 0.01 * min(proxies_count, 10)) * (0.5 + 0.5 * missing_factor)

    total_w = sum(weights.values())
    for k in list(weights.keys()):
        weights[k] = weights[k] / total_w

    tasks = []
    for name, w in weights.items():
        hours = max(1, round(total_hours * w))
        if name in ["Scoping"]:
            phase = "Scoping"
        elif name in ["Data Collection", "Proxy Preparation"]:
            phase = "Data Collection"
        elif name == "Model Setup & Simulation":
            phase = "Modeling"
        elif name == "Validation & QA":
            phase = "Validation"
        else:
            phase = "Reporting"
        tasks.append({"Task": name, "Hours": hours, "Owner": "", "Phase": phase, "Deliverable": ""})
    return tasks

# ===== UI Theming: Plotly and CSS Brand Palette =====

BRAND_COLORWAY = [
    "#2563eb",  # accent blue
    "#115e59",  # teal
    "#334155",  # slate
    "#1e40af",  # primary indigo
    "#6b7280",  # neutral gray
    "#0f766e",  # success teal
    "#4b5563",  # slate dark
    "#1e3a8a",  # deep indigo
]

def apply_brand_plotly_theme(fig):
    fig.update_layout(
        paper_bgcolor="#f8fafc",
        plot_bgcolor="#ffffff",
        font=dict(
            family="Inter, Segoe UI, system-ui, -apple-system, sans-serif",
            color="#0f172a",
            size=14,
        ),
        title_font=dict(size=18, color="#0f172a"),
        legend_title_font=dict(color="#0f172a"),
        legend_font=dict(color="#334155"),
        xaxis=dict(
            gridcolor="#e2e8f0",
            zerolinecolor="#cbd5e1",
            linecolor="#cbd5e1",
            tickfont=dict(color="#334155"),
            title_font=dict(color="#334155"),
        ),
        yaxis=dict(
            gridcolor="#e2e8f0",
            zerolinecolor="#cbd5e1",
            linecolor="#cbd5e1",
            tickfont=dict(color="#334155"),
            title_font=dict(color="#334155"),
        ),
        colorway=BRAND_COLORWAY,
        margin=dict(l=40, r=20, t=60, b=40),
    )

# Custom CSS
st.markdown("""
    <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');

    :root {
        --brand-primary: #1e40af;
        --brand-accent: #2563eb;
        --brand-navy: #0f172a;
        --brand-teal: #115e59;
        --brand-slate-700: #334155;
        --brand-slate-500: #64748b;
        --brand-slate-400: #94a3b8;
        --brand-surface: #ffffff;
        --brand-panel: #f8fafc;
        --brand-border: #e2e8f0;
        --brand-success: #0f766e;
        --brand-warning: #b45309;
        --brand-danger: #b91c1c;

        /* Material Design 3 (Light) palette — neutral grey variant */
        --md3-primary: #475569; /* slate primary */
        --md3-on-primary: #FFFFFF;
        --md3-primary-container: #E2E8F0; /* slate container */
        --md3-on-primary-container: #0F172A;
        --md3-primary-hover: #556070; /* slightly lighter slate */
        --md3-primary-pressed: #3B4757; /* slightly darker slate */
        --md3-hover-surface: #F1F5F9; /* very light grey hover surface */
        --md3-secondary: #475569; /* slate */
        --md3-on-secondary: #FFFFFF;
        --md3-secondary-container: #E2E8F0;
        --md3-on-secondary-container: #0F172A;
        --md3-surface: #F8FAFC; /* light grey surface */
        --md3-on-surface: #1C1B1F;
        --md3-surface-variant: #E2E8F0; /* neutral grey variant */
        --md3-outline: #CBD5E1; /* neutral outline */
        --md3-shadow-1: 0 1px 2px rgba(0,0,0,0.08), 0 2px 6px rgba(0,0,0,0.06);
        --md3-shadow-2: 0 2px 6px rgba(0,0,0,0.10), 0 6px 12px rgba(0,0,0,0.08);
    }

    html, body, .stApp {
        font-family: Inter, Segoe UI, system-ui, -apple-system, sans-serif;
        color: var(--brand-slate-700);
        background-color: var(--brand-panel);
    }
    /* Main container styling */
    .main {
        padding: 1rem 2rem;
        background-color: var(--brand-panel);
    }
    
    /* Typography improvements */
    h1 {
        color: var(--brand-navy);
        font-weight: 700;
        letter-spacing: -0.02em;
        margin-bottom: 0.5rem;
    }
    
    h2 {
        color: var(--brand-slate-700);
        font-weight: 600;
        margin-top: 1.5rem;
        margin-bottom: 1rem;
    }
    
    h3 {
        color: var(--brand-slate-500);
        font-weight: 600;
        margin-top: 1rem;
    }
    
    /* Metric cards */
    .stMetric {
        background-color: var(--md3-surface);
        color: var(--md3-on-surface);
        padding: 1rem;
        border-radius: 12px;
        box-shadow: var(--md3-shadow-1);
        border: 1px solid var(--md3-surface-variant);
        text-align: center;
        min-height: 88px;
    }
    
    /* Badges styling */
    .available-badge {
        background-color: var(--md3-primary-container);
        color: var(--md3-on-primary-container);
        padding: 4px 10px;
        border-radius: 12px;
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.4px;
        border: 1px solid var(--md3-surface-variant);
        box-shadow: none;
    }
    
    .missing-badge {
        background-color: #FEE2E2; /* error container tone */
        color: #7F1D1D; /* on error container */
        padding: 4px 10px;
        border-radius: 12px;
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.4px;
        border: 1px solid #FCA5A5;
        box-shadow: none;
    }
    
    .medium-badge {
        background-color: #FFF4E5; /* warning container tone */
        color: #7C2D12; /* on warning container */
        padding: 4px 10px;
        border-radius: 12px;
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.4px;
        border: 1px solid #FED7AA;
        box-shadow: none;
    }
    
    .high-badge {
        background-color: #FEE2E2;
        color: #7F1D1D;
        padding: 4px 10px;
        border-radius: 12px;
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.4px;
        border: 1px solid #FCA5A5;
        box-shadow: none;
    }
    
    /* Card containers */
    .data-card {
        background-color: var(--md3-surface);
        color: var(--md3-on-surface);
        border-radius: 12px;
        padding: 1rem;
        margin-bottom: 0.85rem;
        box-shadow: var(--md3-shadow-1);
        border: 1px solid var(--md3-surface-variant);
        transition: box-shadow 0.2s ease, transform 0.2s ease;
    }
    .data-card:hover {
        box-shadow: var(--md3-shadow-2);
        transform: translateY(-1px);
    }
    
    /* Selectbox styling */
    .stSelectbox > div > div {
        background-color: var(--brand-surface);
        border-radius: 8px;
        border: 1.5px solid var(--brand-border);
    }
    
    /* Button styling (Material 3 - Light) */
    .stButton > button {
        border-radius: 12px;
        font-weight: 600;
        padding: 0.625rem 1.25rem;
        transition: box-shadow 0.2s ease, transform 0.2s ease, background-color 0.2s ease;
        border: none;
        background-color: var(--md3-primary);
        color: var(--md3-on-primary);
        box-shadow: var(--md3-shadow-1);
    }
    .stButton > button:hover {
        transform: translateY(-1px);
        box-shadow: var(--md3-shadow-2);
        background-color: var(--md3-hover-surface);
        color: var(--md3-primary);
        border: 1px solid var(--md3-outline);
    }
    .stButton > button:focus-visible {
        outline: 3px solid var(--md3-primary-container);
        outline-offset: 2px;
    }
    .stButton > button:active {
        background-color: var(--md3-primary-pressed);
    }
    
    /* Expander styling */
    .streamlit-expanderHeader {
        background-color: var(--brand-surface);
        border-radius: 8px;
        border: 1px solid var(--brand-border);
        font-weight: 500;
    }
    
    /* Progress bar */
    .stProgress > div > div > div {
        background: linear-gradient(90deg, var(--brand-accent), var(--brand-primary));
        border-radius: 4px;
    }
    
    /* Tabs styling */
    .stTabs [data-baseweb="tab-list"] {
        gap: 8px;
        background-color: transparent;
    }
    
    .stTabs [data-baseweb="tab"] {
        background-color: var(--brand-surface);
        border-radius: 8px 8px 0 0;
        padding: 12px 24px;
        font-weight: 500;
        border: 1px solid var(--brand-border);
    }
    
    .stTabs [aria-selected="true"] {
        background: linear-gradient(180deg, var(--brand-accent), var(--brand-primary));
        color: #ffffff;
        border-color: var(--brand-primary);
    }
    
    /* Info box styling */
    .stAlert {
        background-color: var(--brand-surface);
        border-left: 4px solid var(--brand-accent);
        border-radius: 8px;
        padding: 1rem;
    }
    
    /* DataFrame styling */
    .dataframe {
        border: none !important;
        border-radius: 8px;
        overflow: hidden;
    }
    
    /* Checkbox styling */
    .stCheckbox {
        padding: 0.25rem 0;
    }
    
    /* Section dividers */
    hr {
        margin: 2rem 0;
        border: none;
        border-top: 2px solid var(--brand-border);
    }
        /* Playful step cards - Material 3 light */
        .step-card {
            background: none !important;
            background-color: var(--md3-surface);
            padding: 1rem; border-radius: 16px; text-align: center;
            box-shadow: var(--md3-shadow-1); margin-bottom: 1rem;
            transform: translateY(0); transition: transform 0.2s ease, box-shadow 0.2s ease;
            min-height: 140px; display: flex; flex-direction: column; justify-content: center;
            border: 1px solid var(--md3-surface-variant);
        }
        .step-card:hover {
            transform: translateY(-2px);
            box-shadow: var(--md3-shadow-2);
        }
        .step-index {
            display: inline-block;
            color: var(--md3-primary); font-size: 1.1rem; font-weight: 700;
            margin-bottom: 0.35rem;
        }
        .step-title {
            color: var(--md3-on-surface); font-size: 1rem; font-weight: 700; letter-spacing: 0.02em;
        }
        .step-desc {
            color: rgba(28,27,31,0.7); font-size: 0.85rem; margin-top: 0.35rem;
        }
        .step-arrow { 
            display: flex; align-items: center; justify-content: center; 
            height: 140px; color: #8E8DA1; font-size: 1.4rem; 
        }
    </style>
    """, unsafe_allow_html=True)

if st.session_state.wizard_step == 0:
    st.title("Project Planner")
    st.markdown("<p style='font-size: 1.1rem; color: #64748b; margin-top: -0.5rem; margin-bottom: 1.5rem;'>Data Fidelity Navigator - Handle Data Gaps & Review Impacts</p>", unsafe_allow_html=True)
    # Overview diagram upload removed per request

    # Interactive Process Diagram (Playful & Interactive)
    diagram_cols = st.columns([1, 0.15, 1, 0.15, 1, 0.15, 1, 0.15, 1, 0.15, 1])

    with diagram_cols[0]:
        st.markdown("""
        <div class='step-card' style='--grad-start:#1e3a8a; --grad-end:#0f172a;'>
            <div class='step-index'>1</div>
            <div class='step-title'>Define Scope & Context</div>
            <div class='step-desc'>Choose analysis, scale, and context</div>
        </div>
        """, unsafe_allow_html=True)
    with diagram_cols[1]:
        st.markdown("<div class='step-arrow'>➜</div>", unsafe_allow_html=True)
    with diagram_cols[2]:
        st.markdown("""
        <div class='step-card' style='--grad-start:#0f766e; --grad-end:#115e59;'>
            <div class='step-index'>2</div>
            <div class='step-title'>Review Data</div>
            <div class='step-desc'>Mark availability and select proxies</div>
        </div>
        """, unsafe_allow_html=True)
    with diagram_cols[3]:
        st.markdown("<div class='step-arrow'>➜</div>", unsafe_allow_html=True)
    with diagram_cols[4]:
        st.markdown("""
        <div class='step-card' style='--grad-start:#475569; --grad-end:#334155;'>
            <div class='step-index'>3</div>
            <div class='step-title'>Confidence & Recommendations</div>
            <div class='step-desc'>Confidence and recommendations</div>
        </div>
        """, unsafe_allow_html=True)
    with diagram_cols[5]:
        st.markdown("<div class='step-arrow'>➜</div>", unsafe_allow_html=True)
    with diagram_cols[6]:
        st.markdown("""
        <div class='step-card' style='--grad-start:#2563eb; --grad-end:#1e40af;'>
            <div class='step-index'>4</div>
            <div class='step-title'>Expected Results</div>
            <div class='step-desc'>Review expected outcomes</div>
        </div>
        """, unsafe_allow_html=True)
    with diagram_cols[7]:
        st.markdown("<div class='step-arrow'>➜</div>", unsafe_allow_html=True)
    with diagram_cols[8]:
        st.markdown("""
        <div class='step-card' style='--grad-start:#6b7280; --grad-end:#4b5563;'>
            <div class='step-index'>5</div>
            <div class='step-title'>Project Timeline</div>
            <div class='step-desc'>Plan phases and tasks</div>
        </div>
        """, unsafe_allow_html=True)
    with diagram_cols[9]:
        st.markdown("<div class='step-arrow'>➜</div>", unsafe_allow_html=True)
    with diagram_cols[10]:
        st.markdown("""
        <div class='step-card' style='--grad-start:#4b5563; --grad-end:#111827;'>
            <div class='step-index'>6</div>
            <div class='step-title'>Cost Estimation</div>
            <div class='step-desc'>Budget, CAPEX, and OPEX</div>
        </div>
        """, unsafe_allow_html=True)
    st.markdown("<hr style='margin: 2rem 0; border: none; border-top: 2px solid #e2e8f0;'>", unsafe_allow_html=True)
    center_cols = st.columns([1,1,1])
    with center_cols[1]:
        if st.button("Start", type="primary", use_container_width=True):
            st.session_state.wizard_step = 1
            st.rerun()

# Initialize session state
if "data_inputs" not in st.session_state:
    st.session_state.data_inputs = {}

if 'selected_proxies' not in st.session_state:
    st.session_state.selected_proxies = {}

# Add custom CSS for enhanced UI design with layered backgrounds
st.markdown("""
    <style>
    /* Main container background */
    .stApp {
        background: var(--md3-surface);
    }
    
    /* Outer layer - Very light grey background for column containers */
    div[data-testid="column"] {
        position: relative;
        padding: 2rem 0.75rem;
    }
    
    div[data-testid="column"]::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0.5rem;
        right: 0.5rem;
        bottom: 0;
        background: var(--md3-surface);
        border-radius: 24px;
        box-shadow: var(--md3-shadow-1);
        z-index: 0;
    }
    
    /* Inner layer - White background for actual content */
    div[data-testid="column"] > div {
        position: relative;
        z-index: 1;
        background: var(--md3-surface);
        padding: 1.5rem 1.25rem;
        border-radius: 18px;
        box-shadow: var(--md3-shadow-1);
        margin: 0.5rem;
        border: 1px solid var(--md3-surface-variant);
    }
    
    /* Header styling */
    div[data-testid="column"] h1 {
        color: var(--brand-navy);
        font-size: 1.5rem !important;
        margin-bottom: 1.5rem !important;
        padding-bottom: 0.75rem;
        border-bottom: 3px solid var(--brand-accent);
        font-weight: 700;
    }
    
    /* Subheader styling */
    div[data-testid="column"] h2, div[data-testid="column"] h3 {
        color: var(--brand-slate-500);
        font-size: 1.1rem !important;
        margin-top: 1.25rem !important;
        margin-bottom: 0.75rem !important;
        font-weight: 600;
    }
    
    /* Expander styling */
    div[data-testid="stExpander"] {
        background: var(--brand-surface);
        border-radius: 12px;
        border: 1px solid var(--brand-border);
        margin-bottom: 0.75rem;
        box-shadow: 0 2px 6px rgba(0,0,0,0.06);
        transition: all 0.3s ease;
    }
    
    div[data-testid="stExpander"]:hover {
        box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        transform: translateY(-2px);
    }
    
    /* Select box styling with hover effect */
    div[data-testid="stSelectbox"] > div {
        background: var(--brand-surface);
        border-radius: 8px;
        transition: all 0.3s ease;
    }
    
    div[data-testid="stSelectbox"]:hover > div {
        box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        transform: translateY(-2px);
    }
    
    /* Multiselect styling with hover effect */
    div[data-testid="stMultiSelect"] > div {
        background-color: var(--brand-surface) !important;
        border-radius: 8px;
        transition: all 0.3s ease;
    }
    
    div[data-testid="stMultiSelect"] > div > div {
        background-color: var(--brand-surface) !important;
    }
    
    div[data-testid="stMultiSelect"] input {
        background-color: var(--brand-surface) !important;
    }
    
    div[data-testid="stMultiSelect"] [data-baseweb="select"] {
        background-color: var(--brand-surface) !important;
    }
    
    div[data-testid="stMultiSelect"] [data-baseweb="select"] > div {
        background-color: var(--brand-surface) !important;
    }
    
    div[data-testid="stMultiSelect"] [role="combobox"] {
        background-color: var(--brand-surface) !important;
    }
    
    /* Placeholder text styling */
    div[data-testid="stMultiSelect"] [data-baseweb="select"] [data-baseweb="input"] {
        background-color: var(--brand-surface) !important;
    }
    
    div[data-testid="stMultiSelect"] [class*="Input"] {
        background-color: var(--brand-surface) !important;
    }
    
    div[data-testid="stMultiSelect"]:hover > div {
        box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        transform: translateY(-2px);
    }
    
    /* Multiselect dropdown menu */
    div[data-testid="stMultiSelect"] [data-baseweb="popover"] {
        background-color: var(--brand-surface) !important;
    }
    
    div[data-testid="stMultiSelect"] [data-baseweb="menu"] {
        background-color: var(--brand-surface) !important;
    }
    
    div[data-testid="stMultiSelect"] ul {
        background-color: var(--brand-surface) !important;
    }
    
    div[data-testid="stMultiSelect"] li {
        background-color: var(--brand-surface) !important;
    }
    
    div[data-testid="stMultiSelect"] li:hover {
        background-color: #eff6ff !important;
    }
    
    /* Checkbox container styling with hover effect */
    div[data-testid="stCheckbox"] {
        padding: 0.25rem 0;
        transition: all 0.3s ease;
        border-radius: 6px;
        padding: 0.5rem;
        margin: 0.25rem 0;
    }
    
    div[data-testid="stCheckbox"]:hover {
        background: rgba(37, 99, 235, 0.06);
        transform: translateX(4px);
    }
    
    /* Button styling (Material 3 - Light) */
    div[data-testid="column"] button[kind="primary"] {
        background-color: var(--md3-primary);
        color: var(--md3-on-primary);
        border: none;
        border-radius: 12px;
        font-weight: 600;
        padding: 0.75rem 1.5rem;
        box-shadow: var(--md3-shadow-1);
        transition: box-shadow 0.2s ease, transform 0.2s ease, background-color 0.2s ease;
    }
    div[data-testid="column"] button[kind="primary"]:hover {
        transform: translateY(-2px);
        box-shadow: var(--md3-shadow-2);
        background-color: var(--md3-hover-surface);
        color: var(--md3-primary);
        border: 1px solid var(--md3-outline);
    }
    div[data-testid="column"] button[kind="primary"]:active {
        background-color: var(--md3-primary-pressed);
    }
    div[data-testid="column"] .stButton > button:not([kind="primary"]) {
        background-color: transparent;
        color: var(--md3-primary);
        border: 1px solid var(--md3-outline);
        border-radius: 12px;
        box-shadow: none;
        padding: 0.625rem 1.25rem;
        transition: border-color 0.2s ease, transform 0.2s ease;
    }
    div[data-testid="column"] .stButton > button:not([kind="primary"]):hover {
        transform: translateY(-1px);
        border-color: color-mix(in oklab, var(--md3-outline) 70%, var(--md3-primary) 30%);
        background-color: rgba(103, 80, 164, 0.06); /* subtle state layer */
    }
    </style>
""", unsafe_allow_html=True)

# Create three columns for main sections (used in steps 1-3)
col1, col2, col3 = st.columns([1, 1.2, 1])

# ==================== COLUMN 1: Analysis Setup ====================
if st.session_state.wizard_step == 1:
    with col1:
        st.markdown("<h2 style='font-size: 1.8rem; font-weight: 700; margin-bottom: 1rem;'>Step 1: Define Scope & Context</h2>", unsafe_allow_html=True)

        # Analysis Type
        st.subheader("Analysis Type")
        analysis_type = st.multiselect(
            "Select your analysis (one or more):",
            options=[
                "Energy & Carbon Performance",
                "Renewable Energy & Local Production",
                "Retrofit & Transformation",
                "Urban Design Support",
                "Climate Resilience"
            ],
            help="Choose one or more analysis types.",
            key="analysis_type"
        )
        
        if st.session_state.analysis_type:
            st.info(f"📊 {len(st.session_state.analysis_type)} analysis type(s) selected")

        # Define Scale
        st.subheader("Define Your Scale")
        project_scale = st.selectbox(
            "Project scale:",
            options=["Building", "Neighborhood", "City"],
            help="Select the geographic scope of your analysis",
            key="project_scale"
        )
    
        # Building Uses (only for Neighborhood)
        if st.session_state.get("project_scale") == "Neighborhood":
            st.subheader("Building Uses Included")
            st.caption("Select all building types in your analysis:")

            # Controls for building uses
            col_a, col_b = st.columns(2)
            if col_a.button("Select all building uses", key="btn_select_uses"):
                for _k in [
                    'use_residential', 'use_commercial', 'use_industrial',
                    'use_school', 'use_hospital', 'use_sports',
                    'use_office', 'use_mixed_use']:
                    st.session_state[_k] = True
                st.rerun()

            if col_b.button("Unselect all building uses", key="btn_unselect_uses"):
                for _k in [
                    'use_residential', 'use_commercial', 'use_industrial',
                    'use_school', 'use_hospital', 'use_sports',
                    'use_office', 'use_mixed_use']:
                    st.session_state[_k] = False
                st.rerun()

            building_uses = {}
            building_uses['Residential'] = st.checkbox("Residential", value=st.session_state.get('use_residential', False), key='use_residential')
            building_uses['Commercial'] = st.checkbox("Commercial", value=st.session_state.get('use_commercial', False), key='use_commercial')
            building_uses['Industrial'] = st.checkbox("Industrial", value=st.session_state.get('use_industrial', False), key='use_industrial')
            building_uses['School'] = st.checkbox("School", value=st.session_state.get('use_school', False), key='use_school')
            building_uses['Hospital'] = st.checkbox("Hospital", value=st.session_state.get('use_hospital', False), key='use_hospital')
            building_uses['Sports Facilities'] = st.checkbox("Sports Facilities", value=st.session_state.get('use_sports', False), key='use_sports')
            building_uses['Office'] = st.checkbox("Office", value=st.session_state.get('use_office', False), key='use_office')
            building_uses['Mixed-Use'] = st.checkbox("Mixed-Use", value=st.session_state.get('use_mixed_use', False), key='use_mixed_use')

            selected_uses = [k for k, v in building_uses.items() if v]

            if selected_uses:
                st.info(f"{len(selected_uses)} building types selected")
    
        # Context
        st.subheader("Context")
        country = st.selectbox(
            "Select country:",
            options=[
                "Sweden",
                "United Kingdom",
                "Ireland",
                "Belgium"
            ],
            help="Select the country for your analysis",
            key="country"
        )

    # Default outputs are managed globally; no local assignment here

    # Removed Next button after context for streamlined flow

# Navigation: Step 1
    nav1_col1, nav1_col2, nav1_col3, nav1_col4 = st.columns([1, 1, 2, 2])
    with nav1_col1:
        if st.button("◀ Back", use_container_width=True, key="nav_back_1"):
            st.session_state.wizard_step = 0
            st.rerun()
    with nav1_col2:
        if st.button("Next ▶", type="primary", use_container_width=True, key="nav_next_1"):
            st.session_state.wizard_step = 2
            st.rerun()
    with nav1_col3:
        st.markdown("<div style='text-align: left; color: #94a3b8; font-size: 0.9rem; padding-top: 0.5rem;'>Page 1/6</div>", unsafe_allow_html=True)

# ==================== RULES ENGINE: Calculate Everything Dynamically ====================

# Calculate confidence levels based on configuration
# For multiple analyses, use the first one for base confidence calculation
analysis_type = st.session_state.get("analysis_type", [])
project_scale = st.session_state.get("project_scale", "Building")
country = st.session_state.get("country", "Sweden")
# Ensure desired outputs are defined globally to avoid NameError
outputs = st.session_state.get(
    "desired_outputs",
    ["Annual Energy Demand", "Peak Power Load", "Carbon Emissions"]
)
first_analysis = analysis_type[0] if analysis_type else "Energy & Carbon Performance"
confidence_results = calculate_confidence(
    analysis_type=first_analysis,
    data_inputs=st.session_state.data_inputs,
    project_scale=project_scale,
    country=country,
    desired_outputs=outputs
)

# Get recommended proxies for missing data
# For multiple analyses, use the first one for proxy recommendations
recommended_proxies = get_recommended_proxies(
    data_inputs=st.session_state.data_inputs,
    analysis_type=first_analysis,
    project_scale=project_scale
)
st.session_state.recommended_proxies = recommended_proxies or {}

# Get contextual messages and recommendations
# For multiple analyses, use the first one for messages
analysis_messages = get_analysis_messages(
    analysis_type=first_analysis,
    data_inputs=st.session_state.data_inputs,
    project_scale=project_scale,
    confidence_score=confidence_results["overall"]
)

# Compute backend estimates for effort, duration, and cost
completeness_stats = get_data_completeness_stats(analysis_type, st.session_state.data_inputs)
selected_uses_count = get_selected_uses_count()
proxies_count = len(recommended_proxies) if recommended_proxies else 0
effort_results = estimate_effort_and_timeline(
    analysis_type=first_analysis,
    project_scale=project_scale,
    selected_uses_count=selected_uses_count,
    data_completeness_pct=completeness_stats["pct"],
    proxies_count=proxies_count,
)
currency_for_cost = st.session_state.get("currency", "SEK")
cost_results = estimate_cost(effort_results["hours_total"], currency_for_cost)

# ==================== COLUMN 2: Data Availability ====================
if st.session_state.wizard_step == 2:
    with col2:
        analysis_type = st.session_state.get("analysis_type", [])
        st.markdown("<h2 style='font-size: 1.8rem; font-weight: 700; margin-bottom: 1rem; text-align: left;'>Step 2: Review Data Inputs</h2>", unsafe_allow_html=True)
    
    # Progress Indicator - Data Completeness
    if analysis_type:
        filtered_items_preview = get_filtered_data_items(analysis_type)
        total_preview = sum(len(items) for items in filtered_items_preview.values())
        available_preview = sum(1 for items in filtered_items_preview.values() 
                               for item in items 
                               if st.session_state.data_inputs.get(item['key'], False))
        required_preview = sum(1 for items in filtered_items_preview.values() 
                             for item in items if item.get('is_required', False))
        
        completeness_pct = (available_preview / total_preview * 100) if total_preview > 0 else 0
        
        # Display progress
        col_prog1, col_prog2 = st.columns([3, 1])
        with col_prog1:
            st.progress(completeness_pct / 100)
        with col_prog2:
            st.markdown(f"<div style='text-align: right; font-size: 1.2rem; font-weight: 700; color: #3b82f6;'>{completeness_pct:.0f}%</div>", unsafe_allow_html=True)
        
        st.markdown(f"<p style='color: #64748b; font-size: 0.9rem; margin-top: -0.5rem;'>📊 Data Completeness: {available_preview} of {total_preview} items • {required_preview} required</p>", unsafe_allow_html=True)
        st.markdown("<hr style='margin: 1rem 0; border: none; border-top: 1px solid #e2e8f0;'>", unsafe_allow_html=True)

    st.subheader("Do you have the following data inputs?")
    if analysis_type:
        if len(analysis_type) == 1:
            st.caption(f"Showing data requirements for **{analysis_type[0]}**. Indicate data availability below.")
        else:
            st.caption(f"Showing merged requirements for **{len(analysis_type)} analyses**: {', '.join(analysis_type)}. Common requirements appear once.")
    else:
        st.caption("Please select at least one analysis type in Step 1.")
    
    # Get filtered data items based on analysis type
    filtered_data_items = get_filtered_data_items(analysis_type)

    # Initialize session state for filtered items (default to False = "No")
    # This ensures metrics calculate correctly
    for category, items in filtered_data_items.items():
        for item in items:
            if item['key'] not in st.session_state.data_inputs:
                st.session_state.data_inputs[item['key']] = False  # Default to "No"
            if f"proxy_{item['key']}" not in st.session_state:
                st.session_state[f"proxy_{item['key']}"] = None

    # Calculate summary statistics using filtered items
    total_items = sum(len(items) for items in filtered_data_items.values())
    available_items = sum(1 for items in filtered_data_items.values() 
                         for item in items 
                         if st.session_state.data_inputs.get(item['key'], False))
    proxy_items = sum(1 for items in filtered_data_items.values() 
                     for item in items 
                     if not st.session_state.data_inputs.get(item['key'], False) 
                     and st.session_state.get(f"proxy_{item['key']}", 'None (missing)') != 'None (missing)'
                     and st.session_state.get(f"proxy_{item['key']}") is not None)
    missing_items = total_items - available_items - proxy_items

    # Display summary metrics (Step 2)
    col_sum1, col_sum2, col_sum3 = st.columns(3)
    with col_sum1:
        st.metric("✓ Available", f"{available_items}/{total_items}")
    with col_sum2:
        st.metric("⚠️ Using Proxy", proxy_items)
    with col_sum3:
        st.metric("🔴 Missing", missing_items)

    st.markdown("<hr style='margin: 1rem 0; border: none; border-top: 1px solid #e2e8f0;'>", unsafe_allow_html=True)

        # Display data items by category with expandable sections (use filtered items)
    for category, items in filtered_data_items.items():
        st.markdown(f"### {category}")
        for item in items:
                # Add analysis info if multiple analyses selected
                analysis_info = ""
                if analysis_type and len(analysis_type) > 1 and 'analyses' in item:
                    analyses_data = item['analyses']
                    # Create abbreviations for analysis types
                    abbrev_map = {
                        'Energy & Carbon Performance': 'E&C',
                        'Renewable Energy & Local Production': 'RE&LP',
                        'Climate Resilience': 'CR',
                        'Retrofit & Transformation': 'R&T',
                        'Urban Design Support': 'UDS'
                    }
                    info_parts = []
                    if analyses_data['required_in']:
                        abbrev_names = [abbrev_map.get(a, a) for a in analyses_data['required_in']]
                        info_parts.append(f"<span style='font-size: 0.7rem; color: #059669; font-weight: 600;'>Required: {', '.join(abbrev_names)}</span>")
                    if analyses_data['optional_in']:
                        abbrev_names = [abbrev_map.get(a, a) for a in analyses_data['optional_in']]
                        info_parts.append(f"<span style='font-size: 0.7rem; color: #2563eb; font-weight: 600;'>Optional: {', '.join(abbrev_names)}</span>")
                    if info_parts:
                        analysis_info = f"<br/><span style='font-size: 0.7rem; color: #64748b;'>({' | '.join(info_parts)})</span>"
                
                st.markdown(f"<p style='font-weight: 600; margin-bottom: 0.3rem; margin-top: 0.3rem; color: #334155; font-size: 0.9rem;'>{item['label']}{analysis_info}</p>", unsafe_allow_html=True)
                
                # Create columns for Yes/No and Proxy dropdown
                col_radio, col_proxy = st.columns([1, 2])
                
                with col_radio:
                    # Get current state from session state (single source of truth)
                    current_has_data = st.session_state.data_inputs[item['key']]
                    
                    # Create Yes/No radio button - directly use session state for index
                    # The key links to a unique widget that persists its value
                    data_available = st.radio(
                        "Data available?",
                        options=["Yes", "No"],
                        index=0 if current_has_data else 1,
                        key=f"radio_{item['key']}",
                        horizontal=True,
                        label_visibility="collapsed"
                    )
                    
                    # Immediately update session state to match radio selection
                    # This keeps session state in sync with user interaction
                    new_has_data = (data_available == "Yes")
                    if st.session_state.data_inputs[item['key']] != new_has_data:
                        st.session_state.data_inputs[item['key']] = new_has_data
                
                # Use session state as the single source of truth for displaying content
                has_data = st.session_state.data_inputs[item['key']]
                
                with col_proxy:
                    # Show green checkmark if data is available
                    if has_data:
                        st.markdown(
                            '<div style="background: linear-gradient(135deg, #d1fae5, #a7f3d0); '
                            'padding: 0.35rem 0.6rem; border-radius: 6px; border-left: 3px solid #10b981;">'
                            '<p style="margin: 0; font-size: 0.8rem; color: #065f46; font-weight: 600;">'
                            '✓ Data available</p>'
                            '</div>',
                            unsafe_allow_html=True
                        )
                    
                    # Show proxy dropdown if "No" is selected and proxies exist
                    elif not has_data and 'proxy_tiers' in item:
                        # Build proxy options list
                        proxy_options = ['None (missing)']
                        for tier_key in sorted(item['proxy_tiers'].keys()):
                            tier_num = tier_key.replace('tier', '')
                            proxy_name = item['proxy_tiers'][tier_key]['name']
                            confidence_impact = item['proxy_tiers'][tier_key]['confidence_impact']
                            proxy_options.append(f"Tier {tier_num}: {proxy_name} ({confidence_impact}%)")
                        
                        # Select proxy with unique key
                        selected_proxy = st.selectbox(
                            "↳ Use proxy:",
                            options=proxy_options,
                            key=f"proxy_select_{item['key']}",
                            label_visibility="visible"
                        )
                        
                        # Store selected proxy in session state
                        st.session_state[f"proxy_{item['key']}"] = selected_proxy
                
                # Show proxy details below if a proxy is selected
                if not has_data and 'proxy_tiers' in item:
                    selected_proxy = st.session_state.get(f"proxy_{item['key']}", 'None (missing)')
                    
                    if selected_proxy and selected_proxy != 'None (missing)':
                        # Extract tier number from selection
                        tier_num = selected_proxy.split(':')[0].replace('Tier ', '').strip()
                        tier_key = f'tier{tier_num}'
                        proxy_info = item['proxy_tiers'][tier_key]
                        
                        # Determine color coding based on uncertainty
                        uncertainty = proxy_info['uncertainty']
                        if uncertainty in ['Low', 'Low-Medium']:
                            bg_color = "linear-gradient(135deg, #eff6ff, #dbeafe)"
                            border_color = "#2563eb"
                            text_color = "#1e40af"
                            icon = "ℹ️"
                        elif uncertainty in ['Medium', 'Medium-High']:
                            bg_color = "linear-gradient(135deg, #fef3c7, #fde68a)"
                            border_color = "#f59e0b"
                            text_color = "#92400e"
                            icon = "⚠️"
                        else:  # High, Very High
                            bg_color = "linear-gradient(135deg, #fecaca, #fca5a5)"
                            border_color = "#ef4444"
                            text_color = "#7f1d1d"
                            icon = "🔴"
                        
                        # Display styled proxy information box
                        st.markdown(
                            f'<div style="background: {bg_color}; '
                            f'padding: 0.5rem 0.7rem; border-radius: 6px; '
                            f'border-left: 3px solid {border_color}; '
                            f'margin-top: 0.3rem; box-shadow: 0 1px 4px rgba(0,0,0,0.06);">'
                            f'<p style="margin: 0; font-size: 0.8rem; font-weight: 600; color: {text_color};">'
                            f'{icon} {proxy_info["name"]}</p>'
                            f'<p style="margin: 0.3rem 0 0 0; font-size: 0.75rem; color: #64748b;">'
                            f'{proxy_info["description"]}</p>'
                            f'<div style="display: flex; gap: 0.8rem; margin-top: 0.3rem;">'
                            f'<p style="margin: 0; font-size: 0.7rem; font-weight: 600; color: {text_color};">'
                            f'Impact: {proxy_info["confidence_impact"]}%</p>'
                            f'<p style="margin: 0; font-size: 0.7rem; font-weight: 600; color: {text_color};">'
                            f'Uncertainty: {uncertainty}</p>'
                            f'</div>'
                            f'</div>',
                            unsafe_allow_html=True
                        )
                    elif selected_proxy == 'None (missing)':
                        # Warning for missing data with no proxy selected
                        st.markdown(
                            '<div style="background: linear-gradient(135deg, #fee2e2, #fecaca); '
                            'padding: 0.4rem 0.6rem; border-radius: 6px; border-left: 3px solid #b91c1c; '
                            'margin-top: 0.3rem;">'
                            '<p style="margin: 0; font-size: 0.8rem; color: #991b1b; font-weight: 600;">'
                            '🔴 Missing - will impact results</p>'
                            '</div>',
                            unsafe_allow_html=True
                        )
                
                # Add separator between items
                st.markdown("<div style='margin: 0.6rem 0; border-bottom: 1px solid #e2e8f0;'></div>", unsafe_allow_html=True)

        # ==================== Step 2: Define Tasks (Full Width) ====================
if st.session_state.wizard_step == 2:
    with st.container():
        # ... existing code for step 2 ...
        # Navigation: Step 2
        nav2_col1, nav2_col2, nav2_col3, nav2_col4 = st.columns([1, 1, 2, 2])
        with nav2_col1:
            if st.button("◀ Back", use_container_width=True, key="nav_back_2"):
                st.session_state.wizard_step = 1
                st.rerun()
        with nav2_col2:
            if st.button("Next ▶", type="primary", use_container_width=True, key="nav_next_2"):
                st.session_state.wizard_step = 3
                st.rerun()
        with nav2_col3:
            st.markdown("<div style='text-align: left; color: #94a3b8; font-size: 0.9rem; padding-top: 0.5rem;'>Page 2/6</div>", unsafe_allow_html=True)

# ==================== Step 4: Expected Results ====================

if st.session_state.wizard_step == 4:
    st.markdown("<h2 style='font-size: 1.8rem; font-weight: 700; margin: 1.5rem 0 1rem;'>Step 4: Expected Results</h2>", unsafe_allow_html=True)
    st.subheader("What you can expect")

    exp_col1, exp_col2 = st.columns(2)
    with exp_col1:
        st.metric("Overall confidence", f"{confidence_results['overall']:.0f}%")
        st.write("Top outputs")
        outputs_preview = outputs[:3] if outputs else []
        for o in outputs_preview:
            st.markdown(f"- {o}")
    with exp_col2:
        st.write("Key warnings")
        for w in analysis_messages.get("warnings", [])[:3]:
            st.markdown(f"- {w}")
        if not analysis_messages.get("warnings"):
            st.markdown("- No critical warnings")

    st.markdown("---")
    nav4_col1, nav4_col2, nav4_col3, nav4_col4 = st.columns([1, 1, 2, 2])
    with nav4_col1:
        if st.button("◀ Back", use_container_width=True, key="nav_back_4_exp"):
            st.session_state.wizard_step = 3
            st.rerun()
    with nav4_col2:
        if st.button("Next ▶", type="primary", use_container_width=True, key="nav_next_4_exp"):
            st.session_state.wizard_step = 5
            st.rerun()
    with nav4_col3:
        st.markdown("<div style='text-align: left; color: #94a3b8; font-size: 0.9rem; padding-top: 0.5rem;'>Page 4/6</div>", unsafe_allow_html=True)

# ==================== Step 5 & 6: Timeline and Cost (Full Width) ====================

if "project_start_date" not in st.session_state:
    st.session_state.project_start_date = None
if "project_end_date" not in st.session_state:
    st.session_state.project_end_date = None
if "timeline_rows" not in st.session_state:
    st.session_state.timeline_rows = [
        {"Task": "", "Start": None, "Finish": None, "Owner": "", "Phase": ""}
    ]
if "task_rows" not in st.session_state:
    st.session_state.task_rows = []
if "use_task_plan" not in st.session_state:
    st.session_state.use_task_plan = False

if st.session_state.wizard_step == 5:
    st.markdown("<h2 style='font-size: 1.8rem; font-weight: 700; margin: 1.5rem 0 1rem;'>Step 5: Project Timeline</h2>", unsafe_allow_html=True)
    st.subheader("Project Timeline")

    tcol1, tcol2 = st.columns(2)
    with tcol1:
        st.session_state.project_start_date = st.date_input("Project start", value=st.session_state.project_start_date)
    with tcol2:
        st.session_state.project_end_date = st.date_input("Project end", value=st.session_state.project_end_date)

    # Navigation: Step 5
    nav4_col1, nav4_col2, nav4_col3, nav4_col4 = st.columns([1, 1, 2, 2])
    with nav4_col1:
        if st.button("◀ Back", use_container_width=True, key="nav_back_5"):
            st.session_state.wizard_step = 4
            st.rerun()
    with nav4_col2:
        if st.button("Next ▶", type="primary", use_container_width=True, key="nav_next_5"):
            st.session_state.wizard_step = 6
            st.rerun()
    with nav4_col3:
        st.markdown("<div style='text-align: left; color: #94a3b8; font-size: 0.9rem; padding-top: 0.5rem;'>Page 5/6</div>", unsafe_allow_html=True)

    # Helper: populate timeline from estimated phases
    gen_cols = st.columns([1,1,2])
    if gen_cols[0].button("Populate timeline (estimated)"):
        start_date = st.session_state.project_start_date or datetime.today().date()
        current = pd.to_datetime(start_date)
        weekly_capacity = 30.0
        phase_rows = []
        for phase, hrs in effort_results["hours_breakdown"].items():
            weeks = max(1, round(hrs / weekly_capacity))
            days = int(weeks * 7)
            start = current
            finish = current + pd.to_timedelta(days, unit='D')
            phase_rows.append({
                "Task": phase,
                "Start": start.date(),
                "Finish": finish.date(),
                "Owner": "",
                "Phase": phase
            })
            current = finish
        st.session_state.timeline_rows = phase_rows

    # Timeline editor and chart
    timeline_df = pd.DataFrame(st.session_state.timeline_rows)
    edited_timeline = st.data_editor(
        timeline_df,
        num_rows="dynamic",
        use_container_width=True,
        column_config={
            "Task": st.column_config.TextColumn("Task"),
            "Start": st.column_config.DateColumn("Start"),
            "Finish": st.column_config.DateColumn("Finish"),
            "Owner": st.column_config.TextColumn("Owner"),
            "Phase": st.column_config.TextColumn("Phase"),
        },
        key="data_editor_timeline"
    )
    st.session_state.timeline_rows = edited_timeline.to_dict(orient="records")

    valid_timeline = edited_timeline.dropna(subset=["Task", "Start", "Finish"])
    if not valid_timeline.empty:
        valid_timeline["Start"] = pd.to_datetime(valid_timeline["Start"])  # type: ignore
        valid_timeline["Finish"] = pd.to_datetime(valid_timeline["Finish"])  # type: ignore
        fig_timeline = px.timeline(
            valid_timeline,
            x_start="Start",
            x_end="Finish",
            y="Task",
            color="Phase" if "Phase" in valid_timeline.columns else None,
            title="Project Timeline"
        )
        fig_timeline.update_yaxes(autorange="reversed")
        apply_brand_plotly_theme(fig_timeline)
        st.plotly_chart(fig_timeline, use_container_width=True)

 

if st.session_state.wizard_step == 6:
    st.markdown("<h2 style='font-size: 1.8rem; font-weight: 700; margin: 1.5rem 0 1rem;'>Step 6: Tasks & Cost</h2>", unsafe_allow_html=True)
    st.subheader("Task Planner (optional)")

    pcols = st.columns([1,1,1,2])
    with pcols[0]:
        if st.button("Suggest tasks from inputs"):
            base_total = effort_results["hours_total"]
            st.session_state.task_rows = generate_suggested_tasks(
                total_hours=base_total,
                proxies_count=proxies_count,
                completeness_pct=completeness_stats["pct"],
                analysis_type=first_analysis,
                project_scale=project_scale,
            )
    with pcols[1]:
        if st.button("Clear tasks"):
            st.session_state.task_rows = []
    with pcols[2]:
        st.session_state.use_task_plan = st.toggle("Use task plan for duration/cost", value=st.session_state.use_task_plan)

    # Editable task table
    task_df = pd.DataFrame(
        st.session_state.task_rows if st.session_state.task_rows else [],
        columns=["Task","Hours","Owner","Phase","Deliverable"]
    )
    task_df = st.data_editor(
        task_df,
        num_rows="dynamic",
        use_container_width=True,
        column_config={
            "Task": st.column_config.TextColumn("Task", required=True),
            "Hours": st.column_config.NumberColumn("Hours", min_value=0, step=1),
            "Owner": st.column_config.TextColumn("Owner"),
            "Phase": st.column_config.TextColumn("Phase"),
            "Deliverable": st.column_config.TextColumn("Deliverable"),
        },
        key="data_editor_tasks"
    )
    st.session_state.task_rows = task_df.to_dict(orient="records")

    # Compute task plan totals
    task_total_hours = 0
    tasks_duration_weeks = 0
    if st.session_state.task_rows:
        task_total_hours = int(sum(max(0, float(r.get("Hours", 0) or 0)) for r in st.session_state.task_rows))
        weekly_capacity = 30.0
        tasks_duration_weeks = max(1, round(task_total_hours / weekly_capacity)) if task_total_hours > 0 else 0

    if task_total_hours > 0:
        st.caption(f"Task plan total: {task_total_hours} hours • ~{tasks_duration_weeks} weeks @ 30 hrs/week")

    # Populate timeline from tasks
    gen_cols2 = st.columns([1,3])
    with gen_cols2[0]:
        if st.button("Populate timeline from tasks") and st.session_state.task_rows:
            start_date = st.session_state.project_start_date or datetime.today().date()
            current = pd.to_datetime(start_date)
            weekly_capacity = 30.0
            rows = []
            for r in st.session_state.task_rows:
                hrs = max(0, float(r.get("Hours", 0) or 0))
                weeks = max(1, round(hrs / weekly_capacity)) if hrs > 0 else 1
                days = int(weeks * 7)
                start = current
                finish = current + pd.to_timedelta(days, unit='D')
                rows.append({
                    "Task": r.get("Task", "Task"),
                    "Start": start.date(),
                    "Finish": finish.date(),
                    "Owner": r.get("Owner", ""),
                    "Phase": r.get("Phase", "") or ("Modeling" if "Model" in r.get("Task","") else "")
                })
                current = finish
            st.session_state.timeline_rows = rows

    st.markdown("<h2 style='font-size: 1.8rem; font-weight: 700; margin: 1.5rem 0 1rem;'>Cost & Budget</h2>", unsafe_allow_html=True)
    st.subheader("Cost Inputs")

    # Show auto-estimated service cost reacting to inputs
    eco1, eco2, eco3 = st.columns(3)
    with eco1:
        # Use task plan for effort if enabled
        effective_hours_total = effort_results["hours_total"]
        if st.session_state.get("use_task_plan") and st.session_state.get("task_rows"):
            _task_hours = int(sum(max(0, float(r.get("Hours", 0) or 0)) for r in st.session_state.task_rows))
            if _task_hours > 0:
                effective_hours_total = _task_hours
        st.metric("Estimated Effort (hours)", effective_hours_total)
    with eco2:
        weekly_capacity = 30.0
        effective_duration_weeks = effort_results["duration_weeks"]
        if st.session_state.get("use_task_plan") and st.session_state.get("task_rows") and effective_hours_total > 0:
            effective_duration_weeks = max(1, round(effective_hours_total / weekly_capacity))
        st.metric("Estimated Duration (weeks)", effective_duration_weeks)
    with eco3:
        # Recompute cost based on effective hours
        cost_results = estimate_cost(effective_hours_total, currency_for_cost)
        st.metric("Estimated Service Cost (CNL)", f"{cost_results['estimated_service_cost']:,.0f} {currency_for_cost}")

    if "currency" not in st.session_state:
        st.session_state.currency = "SEK"

    currency = st.selectbox("Currency", options=["USD", "EUR", "GBP", "SEK", "NOK", "DKK"], index=["USD", "EUR", "GBP", "SEK", "NOK", "DKK"].index(st.session_state.currency))
    st.session_state.currency = currency
    default_rate = CONSULTANT_RATES.get(currency, 150.0)
    st.session_state.consultant_rate = st.number_input("Consultant hourly rate", min_value=0.0, value=float(st.session_state.get("consultant_rate", default_rate)))

    capex_cols = st.columns(2)
    with capex_cols[0]:
        capex_construction = st.number_input("Construction", min_value=0.0, value=float(st.session_state.get("capex_construction", 0.0)))
        capex_design = st.number_input("Design & Engineering", min_value=0.0, value=float(st.session_state.get("capex_design", 0.0)))
        capex_permits = st.number_input("Permits & Approvals", min_value=0.0, value=float(st.session_state.get("capex_permits", 0.0)))
        capex_equipment = st.number_input("Equipment & Materials", min_value=0.0, value=float(st.session_state.get("capex_equipment", 0.0)))
    with capex_cols[1]:
        contingency_pct = st.slider("Contingency (%)", min_value=0, max_value=30, value=int(st.session_state.get("contingency_pct", 10)))
        st.session_state.contingency_pct = contingency_pct

    st.session_state.capex_construction = capex_construction
    st.session_state.capex_design = capex_design
    st.session_state.capex_permits = capex_permits
    st.session_state.capex_equipment = capex_equipment

    opex_cols = st.columns(2)
    with opex_cols[0]:
        opex_energy = st.number_input("Energy & Utilities (annual)", min_value=0.0, value=float(st.session_state.get("opex_energy", 0.0)))
        opex_maintenance = st.number_input("Maintenance (annual)", min_value=0.0, value=float(st.session_state.get("opex_maintenance", 0.0)))
    with opex_cols[1]:
        opex_staffing = st.number_input("Staffing (annual)", min_value=0.0, value=float(st.session_state.get("opex_staffing", 0.0)))
        opex_other = st.number_input("Other Opex (annual)", min_value=0.0, value=float(st.session_state.get("opex_other", 0.0)))

        st.markdown("<div style='text-align: center; color: #94a3b8; font-size: 0.9rem;'>Page 6/6</div>", unsafe_allow_html=True)
        nav5_col1, nav5_col2, nav5_col3 = st.columns([2, 1, 1])
        with nav5_col1:
            st.markdown("<div style='text-align: left; color: #94a3b8; font-size: 0.9rem; padding-top: 0.5rem;'>Page 6/6</div>", unsafe_allow_html=True)
        with nav5_col2:
            if st.button("◀ Back", use_container_width=True):
                st.session_state.wizard_step = 5
                st.rerun()
        with nav5_col3:
            if st.button("Restart ↺", use_container_width=True):
                st.session_state.wizard_step = 0
                st.rerun()

    st.session_state.opex_energy = opex_energy
    st.session_state.opex_maintenance = opex_maintenance
    st.session_state.opex_staffing = opex_staffing
    st.session_state.opex_other = opex_other

    capex_base = capex_construction + capex_design + capex_permits + capex_equipment
    capex_total = capex_base * (1 + contingency_pct / 100.0)
    opex_total = opex_energy + opex_maintenance + opex_staffing + opex_other

    mcol1, mcol2, mcol3 = st.columns(3)
    with mcol1:
        st.metric("CAPEX (with contingency)", f"{capex_total:,.0f} {currency}")
    with mcol2:
        st.metric("Annual OPEX", f"{opex_total:,.0f} {currency}")
    with mcol3:
        st.metric("Contingency", f"{contingency_pct}%")

    breakdown_df = pd.DataFrame({
        "Category": ["Construction", "Design", "Permits", "Equipment", "Contingency"],
        "Amount": [capex_construction, capex_design, capex_permits, capex_equipment, capex_total - capex_base]
    })
    fig_cost = px.pie(breakdown_df, values="Amount", names="Category", title="CAPEX Breakdown")
    apply_brand_plotly_theme(fig_cost)
    st.plotly_chart(fig_cost, use_container_width=True)

# ==================== COLUMN 3: Proxy Recommendations & Confidence ====================
if st.session_state.wizard_step == 3:
    with col3:
        st.markdown("<h2 style='font-size: 1.8rem; font-weight: 700; margin-bottom: 1rem;'>Step 3: Confidence & Recommendations</h2>", unsafe_allow_html=True)
    # Quick summary metrics reacting to user configuration (Step 3)
    m3c1, m3c2, m3c3 = st.columns(3)
    # Use task plan totals if enabled and available
    effective_hours_total = effort_results["hours_total"]
    effective_duration_weeks = effort_results["duration_weeks"]
    if st.session_state.get("use_task_plan") and st.session_state.get("task_rows"):
        _task_hours = int(sum(max(0, float(r.get("Hours", 0) or 0)) for r in st.session_state.task_rows))
        if _task_hours > 0:
            effective_hours_total = _task_hours
            weekly_capacity = 30.0
            effective_duration_weeks = max(1, round(effective_hours_total / weekly_capacity))
    with m3c1:
        st.metric("Estimated Effort (hours)", effective_hours_total)
    with m3c2:
        st.metric("Estimated Duration (weeks)", effective_duration_weeks)
    with m3c3:
        # Recompute cost on the fly to reflect effective hours
        _cost = estimate_cost(effective_hours_total, currency_for_cost)
        st.metric("Estimated Service Cost (CNL)", f"{_cost['estimated_service_cost']:,.0f} {currency_for_cost}")
    
    # Export Report Buttons at the top
    if analysis_type:
        export_col1, export_col2 = st.columns(2)
        with export_col1:
            if st.button("📄 Export PDF", use_container_width=True, help="Download comprehensive report"):
                st.info("📥 PDF export functionality - Coming soon!")
        with export_col2:
            if st.button("📊 Export Excel", use_container_width=True, help="Download data tables"):
                st.info("📥 Excel export functionality - Coming soon!")
        st.markdown("<hr style='margin: 1rem 0; border: none; border-top: 2px solid #e2e8f0;'>", unsafe_allow_html=True)
    
    # Display Proxy Recommendations Dynamically
    st.subheader("Recommended Proxy Data")
    
    if st.session_state.get("recommended_proxies"):
        # Mapping for proxy data labels
        data_items_display = {
            'building_footprints': {'label': 'Building Footprints'},
            'construction_age': {'label': 'Construction Age'},
            'energy_consumption': {'label': 'Energy Consumption'},
            'building_materials': {'label': 'Building Materials'},
            'occupancy_data': {'label': 'Occupancy Data'},
            'climate_data': {'label': 'Climate Data'},
            'hvac_systems': {'label': 'HVAC Systems'},
            'cost_data': {'label': 'Cost Data'}
        }
        
        for data_item, proxy_info in st.session_state.recommended_proxies.items():
            data_label = data_items_display[data_item]['label']
            tier_num = proxy_info['tier'].replace('tier', '')
            
            # Determine badge color based on uncertainty
            if proxy_info['uncertainty'] == "Medium":
                badge_class = "medium-badge"
                bg_gradient = "linear-gradient(135deg, #fef3c7, #fde68a)"
                border_color = "#f59e0b"
                text_color = "#92400e"
            elif proxy_info['uncertainty'] == "High":
                badge_class = "high-badge"
                bg_gradient = "linear-gradient(135deg, #fecaca, #fca5a5)"
                border_color = "#ef4444"
                text_color = "#7f1d1d"
            else:  # Very High
                badge_class = "high-badge"
                bg_gradient = "linear-gradient(135deg, #fca5a5, #f87171)"
                border_color = "#dc2626"
                text_color = "#7f1d1d"
            
            # Show as expandable section
            is_recommended = proxy_info.get('is_critical', False) or tier_num == "1"
            tier_label = f"Tier {tier_num} Proxy for {data_label}"
            if is_recommended:
                tier_label += " (Recommended)"
            
            with st.expander(tier_label, expanded=False):
                with st.container():
                    st.markdown(f'<div style="background: {bg_gradient}; border-left: 3px solid {border_color}; padding: 0.8rem; border-radius: 10px; box-shadow: 0 1px 4px rgba(0,0,0,0.06);">', unsafe_allow_html=True)
                    st.markdown(f"<p style='font-weight: 600; color: {text_color}; margin: 0;'>{proxy_info['name']}</p>", unsafe_allow_html=True)
                    st.markdown(f'<span class="{badge_class}">{proxy_info["uncertainty"]} Uncertainty</span>', unsafe_allow_html=True)
                    
                    st.caption(proxy_info['description'])
                    st.caption(f"Confidence Impact: {proxy_info['confidence_impact']}%")
                    
                    if proxy_info['outputs_affected']:
                        st.caption(f"Affects: {', '.join(proxy_info['outputs_affected'])}")
                    
                    # Show suitable/not suitable
                    if len(proxy_info['suitable_for']) + len(proxy_info['not_suitable_for']) > 0:
                        cols = st.columns(2)
                        with cols[0]:
                            if proxy_info['suitable_for']:
                                st.markdown("<p style='font-size: 0.85rem; font-weight: 600; color: #059669; margin-top: 0.5rem;'>✓ Suitable for:</p>", unsafe_allow_html=True)
                                for item in proxy_info['suitable_for']:
                                    st.markdown(f"<p style='font-size: 0.8rem; color: #059669; margin: 0;'>• {item}</p>", unsafe_allow_html=True)
                        with cols[1]:
                            if proxy_info['not_suitable_for']:
                                st.markdown("<p style='font-size: 0.85rem; font-weight: 600; color: #dc2626; margin-top: 0.5rem;'>✗ Not suitable for:</p>", unsafe_allow_html=True)
                                for item in proxy_info['not_suitable_for']:
                                    st.markdown(f"<p style='font-size: 0.8rem; color: #dc2626; margin: 0;'>• {item}</p>", unsafe_allow_html=True)
                    
                    st.markdown('</div>', unsafe_allow_html=True)
    else:
        st.info("✓ All critical data available! No proxies needed.")
    
    # Show scale-specific message
    if confidence_results.get("scale_message"):
        st.markdown("<hr style='margin: 0.5rem 0;'>", unsafe_allow_html=True)
        st.info(f"**Scale Note:** {confidence_results['scale_message']}")
    
    # Show country-specific note
    if confidence_results.get("country_note"):
        st.info(f"**{country}:** {confidence_results['country_note']}")
    
    # Model Output Confidence Section
    st.markdown("<hr style='margin: 1rem 0;'>", unsafe_allow_html=True)
    st.subheader("Model Output Confidence")
    
    # Overall Confidence (Branded Box)
    overall_conf = confidence_results["overall"]

    # Determine color and background based on confidence level
    if overall_conf >= 70:
        conf_color = "#0f766e"  # brand success teal
        conf_label = "Good"
        conf_bg = "linear-gradient(135deg, #d1fae5, #a7f3d0)"
    elif overall_conf >= 50:
        conf_color = "#b45309"  # brand amber
        conf_label = "Medium"
        conf_bg = "linear-gradient(135deg, #ffedd5, #fed7aa)"
    else:
        conf_color = "#b91c1c"  # brand deep red
        conf_label = "Low"
        conf_bg = "linear-gradient(135deg, #fee2e2, #fecaca)"

    st.markdown(
        f'<div style="background: {conf_bg}; padding: 0.9rem; border-radius: 10px; border-left: 4px solid {conf_color}; margin-bottom: 0.6rem;">'
        f'<p style="font-size: 2.0rem; font-weight: 700; color: {conf_color}; margin: 0; text-align: center;">{overall_conf}%</p>'
        f'<p style="color: #64748b; margin: 0; text-align: center; font-weight: 600;">{conf_label} Confidence</p></div>',
        unsafe_allow_html=True
    )
    
    # Confidence Prediction Calculator
    with st.expander("🎯 Confidence Prediction - What If?", expanded=False):
        st.markdown("**See how your confidence improves with additional data**")
        
        if analysis_type:
            filtered_items_pred = get_filtered_data_items(analysis_type)
            missing_critical = []
            missing_important = []
            
            for category_items in filtered_items_pred.values():
                for item in category_items:
                    if not st.session_state.data_inputs.get(item['key'], False):
                        if item.get('is_required', False):
                            missing_critical.append(item)
                        else:
                            missing_important.append(item)
            
            if missing_critical or missing_important:
                st.markdown("**Select data items you plan to obtain:**")
                
                predicted_additions = []
                
                if missing_critical:
                    st.markdown("<p style='color: #ef4444; font-weight: 600; font-size: 0.9rem; margin-top: 0.5rem;'>🔴 Critical Items (High Impact):</p>", unsafe_allow_html=True)
                    for idx, item in enumerate(missing_critical[:5]):  # Show top 5
                        if st.checkbox(f"{item['label']}", key=f"pred_crit_{idx}_{item['key']}", help="Critical for analysis"):
                            predicted_additions.append(item['key'])
                
                if missing_important:
                    st.markdown("<p style='color: #f59e0b; font-weight: 600; font-size: 0.9rem; margin-top: 0.5rem;'>⚠️ Important Items (Medium Impact):</p>", unsafe_allow_html=True)
                    for idx, item in enumerate(missing_important[:5]):  # Show top 5
                        if st.checkbox(f"{item['label']}", key=f"pred_imp_{idx}_{item['key']}", help="Important for accuracy"):
                            predicted_additions.append(item['key'])
                
                # Calculate predicted confidence
                if predicted_additions:
                    simulated.inputs = st.session_state.data_inputs.copy()
                    for key in predicted_additions:
                        simulated.inputs[key] = True
                    
                    predicted_results = calculate_confidence(
                        analysis_type=first_analysis,
                        data_inputs=simulated.inputs,
                        project_scale=project_scale,
                        country=country,
                        desired_outputs=outputs
                    )
                    
                    improvement = predicted_results['overall'] - confidence_results['overall']
                    
                    st.markdown("<hr style='margin: 0.5rem 0; border: none; border-top: 1px solid #e2e8f0;'>", unsafe_allow_html=True)
                    st.markdown("<div style='background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%); padding: 0.7rem; border-radius: 8px; border-left: 3px solid #3b82f6;'>", unsafe_allow_html=True)
                    st.markdown(f"<p style='margin: 0; font-size: 0.9rem; color: #1e40af;'><strong>Predicted Confidence:</strong> {predicted_results['overall']}%</p>", unsafe_allow_html=True)
                    if improvement > 0:
                        st.markdown(f"<p style='margin: 0.3rem 0 0 0; font-size: 1rem; color: #10b981; font-weight: 700;'>+{improvement:.0f}% improvement!</p>", unsafe_allow_html=True)
                    st.markdown("</div>", unsafe_allow_html=True)
            else:
                st.success("✓ All data items available! Excellent data coverage.")

        # Recommended Actions inside the same dropdown
        if analysis_messages.get("recommendations"):
            st.markdown("<hr style='margin: 0.5rem 0; border: none; border-top: 1px solid #e2e8f0;'>", unsafe_allow_html=True)
            st.markdown("**Recommended Actions**")
            for idx, rec in enumerate(analysis_messages["recommendations"], 1):
                st.markdown(f"{idx}. {rec}")
    
    # Removed per-output confidence breakdown as requested

    # Warnings section removed as requested

    # Limitations section removed as requested

    # Recommended Actions moved into Confidence Prediction dropdown
    
    # Data Source Directory
    st.markdown("<hr style='margin: 2rem 0; border: none; border-top: 2px solid #e2e8f0;'>", unsafe_allow_html=True)
    with st.expander("📚 Data Source Directory - Where to Find Data", expanded=False):
        st.markdown("**Universal Data Sources:**")
        
        universal_sources = [
            {"name": "OpenStreetMap", "url": "https://www.openstreetmap.org", "data": "Building footprints, locations"},
            {"name": "Google Earth Engine", "url": "https://earthengine.google.com", "data": "Satellite imagery, land use"},
            {"name": "EnergyPlus Weather Data", "url": "https://energyplus.net/weather", "data": "EPW climate files"},
            {"name": "Climate.OneBuilding.Org", "url": "https://climate.onebuilding.org", "data": "Weather files worldwide"},
            {"name": "IPCC Emission Factors", "url": "https://www.ipcc.ch", "data": "Carbon emission factors"},
        ]
        
        for source in universal_sources:
            st.markdown(f"- **[{source['name']}]({source['url']})** - {source['data']}")
        
        # Country-specific resources
        data_sources = {
            "Sweden": [
                {"name": "Swedish Energy Agency", "url": "https://www.energimyndigheten.se", "data": "Energy statistics, building data"},
                {"name": "Statistics Sweden (SCB)", "url": "https://www.scb.se", "data": "Building census, demographics"},
                {"name": "Lantmäteriet", "url": "https://www.lantmateriet.se", "data": "Cadastral data, GIS data"},
                {"name": "SMHI Climate Data", "url": "https://www.smhi.se", "data": "Weather files, climate data"},
            ],
            "Germany": [
                {"name": "DENA (German Energy Agency)", "url": "https://www.dena.de", "data": "Building energy data"},
                {"name": "Destatis", "url": "https://www.destatis.de", "data": "Building statistics"},
                {"name": "DWD Weather Service", "url": "https://www.dwd.de", "data": "Climate data"},
            ],
            "United Kingdom": [
                {"name": "EPC Register", "url": "https://www.gov.uk/find-energy-certificate", "data": "Energy Performance Certificates"},
                {"name": "ONS", "url": "https://www.ons.gov.uk", "data": "Building and demographic data"},
                {"name": "Met Office", "url": "https://www.metoffice.gov.uk", "data": "Weather data"},
            ],
            "Denmark": [
                {"name": "Danish Energy Agency", "url": "https://ens.dk", "data": "Energy statistics"},
                {"name": "Statistics Denmark", "url": "https://www.dst.dk", "data": "Building data"},
                {"name": "DMI", "url": "https://www.dmi.dk", "data": "Climate data"},
            ],
            "Norway": [
                {"name": "Norwegian Water Resources", "url": "https://www.nve.no", "data": "Energy statistics"},
                {"name": "Statistics Norway", "url": "https://www.ssb.no", "data": "Building data"},
            ],
            "Finland": [
                {"name": "Statistics Finland", "url": "https://www.stat.fi", "data": "Building statistics"},
                {"name": "Finnish Meteorological Institute", "url": "https://en.ilmatieteenlaitos.fi", "data": "Climate data"},
            ],
        }
        
        st.markdown("<hr style='margin: 1rem 0; border: none; border-top: 1px solid #e2e8f0;'>", unsafe_allow_html=True)
        
        # Country-specific sources
        if country in data_sources:
            st.markdown(f"**{country}-Specific Resources:**")
            for source in data_sources[country]:
                st.markdown(f"- **[{source['name']}]({source['url']})** - {source['data']}")
        
        st.markdown("<hr style='margin: 1rem 0; border: none; border-top: 1px solid #e2e8f0;'>", unsafe_allow_html=True)
        st.markdown("**Data Types & Where to Find Them:**")
        st.markdown("""
        - **Building Geometry**: GIS portals, cadastral offices, municipal planning departments
        - **Energy Data**: Utility companies, building managers, smart meter data providers
        - **Construction Materials**: Building permits, architectural archives, site surveys, thermal imaging
        - **Climate Data**: National weather services, EnergyPlus.net, Climate.OneBuilding.Org
        - **Occupancy**: Census data, building management systems, surveys, mobile network data
        - **Emission Factors**: National energy agencies, IPCC databases, electricity grid operators
        - **HVAC Systems**: Building technical documentation, facility management records
        """)
        
        st.info("💡 Tip: Start with free open data sources (OpenStreetMap, government portals) before considering commercial data providers.")

        # Navigation: Step 3
        nav3_col1, nav3_col2, nav3_col3, nav3_col4 = st.columns([1, 1, 2, 2])
        with nav3_col1:
            if st.button("◀ Back", use_container_width=True, key="nav_back_3"):
                st.session_state.wizard_step = 2
                st.rerun()
        with nav3_col2:
            if st.button("Next ▶", type="primary", use_container_width=True, key="nav_next_3"):
                st.session_state.wizard_step = 4
                st.rerun()
        with nav3_col3:
            st.markdown("<div style='text-align: left; color: #94a3b8; font-size: 0.9rem; padding-top: 0.5rem;'>Page 3/6</div>", unsafe_allow_html=True)

    # Step 4 & 5 moved above (full-width) for readability

# (Bottom visualizations removed for now to simplify step gating)
