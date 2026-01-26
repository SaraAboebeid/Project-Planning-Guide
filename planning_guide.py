import streamlit as st
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from datetime import datetime
import random

# Page configuration
st.set_page_config(page_title="Project Planning Guide", layout="wide")

# ==================== CONFIGURATION & RULES ENGINE ====================

# Data requirements by analysis type
ANALYSIS_REQUIREMENTS = {
    "PED Planning": {
        "critical_data": ["building_footprints", "energy_consumption", "climate_data"],
        "important_data": ["construction_age", "building_materials", "occupancy_data"],
        "base_confidence": 70,
        "scale_preference": ["Neighborhood", "City"]
    },
    "ECOM Planning": {
        "critical_data": ["building_footprints", "energy_consumption", "construction_age"],
        "important_data": ["building_materials", "hvac_systems", "climate_data"],
        "base_confidence": 65,
        "scale_preference": ["Building", "Neighborhood"]
    },
    "Academic Research": {
        "critical_data": ["building_footprints", "construction_age", "building_materials"],
        "important_data": ["energy_consumption", "occupancy_data"],
        "base_confidence": 75,
        "scale_preference": ["Building", "Neighborhood", "City"]
    },
    "Investment Feasibility": {
        "critical_data": ["building_footprints", "energy_consumption", "construction_age", "building_materials"],
        "important_data": ["occupancy_data", "hvac_systems", "cost_data"],
        "base_confidence": 60,
        "scale_preference": ["Building", "Neighborhood"]
    },
    "Energy Audit": {
        "critical_data": ["building_footprints", "energy_consumption", "hvac_systems"],
        "important_data": ["construction_age", "building_materials", "occupancy_data"],
        "base_confidence": 80,
        "scale_preference": ["Building"]
    },
    "Carbon Assessment": {
        "critical_data": ["building_footprints", "energy_consumption", "building_materials"],
        "important_data": ["construction_age", "climate_data", "hvac_systems"],
        "base_confidence": 70,
        "scale_preference": ["Building", "Neighborhood", "City"]
    },
    "Retrofit Planning": {
        "critical_data": ["building_footprints", "construction_age", "energy_consumption", "building_materials"],
        "important_data": ["hvac_systems", "occupancy_data", "cost_data"],
        "base_confidence": 65,
        "scale_preference": ["Building", "Neighborhood"]
    }
}

# Proxy tiers for missing data
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

# Custom CSS
st.markdown("""
    <style>
    /* Main container styling */
    .main {
        padding: 1rem 2rem;
        background-color: #f8f9fa;
    }
    
    /* Typography improvements */
    h1 {
        color: #1e293b;
        font-weight: 700;
        letter-spacing: -0.02em;
        margin-bottom: 0.5rem;
    }
    
    h2 {
        color: #334155;
        font-weight: 600;
        margin-top: 1.5rem;
        margin-bottom: 1rem;
    }
    
    h3 {
        color: #475569;
        font-weight: 600;
        margin-top: 1rem;
    }
    
    /* Metric cards */
    .stMetric {
        background: linear-gradient(145deg, #ffffff, #f8f9fa);
        padding: 1.25rem;
        border-radius: 12px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.08);
        border: 1px solid #e2e8f0;
    }
    
    /* Badges styling */
    .available-badge {
        background: linear-gradient(135deg, #10b981, #059669);
        color: white;
        padding: 4px 12px;
        border-radius: 16px;
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        box-shadow: 0 2px 4px rgba(16, 185, 129, 0.3);
    }
    
    .missing-badge {
        background: linear-gradient(135deg, #ef4444, #dc2626);
        color: white;
        padding: 4px 12px;
        border-radius: 16px;
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        box-shadow: 0 2px 4px rgba(239, 68, 68, 0.3);
    }
    
    .medium-badge {
        background: linear-gradient(135deg, #f59e0b, #d97706);
        color: white;
        padding: 4px 12px;
        border-radius: 16px;
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        box-shadow: 0 2px 4px rgba(245, 158, 11, 0.3);
    }
    
    .high-badge {
        background: linear-gradient(135deg, #ef4444, #dc2626);
        color: white;
        padding: 4px 12px;
        border-radius: 16px;
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        box-shadow: 0 2px 4px rgba(239, 68, 68, 0.3);
    }
    
    /* Card containers */
    .data-card {
        background: white;
        border-radius: 12px;
        padding: 1.25rem;
        margin-bottom: 1rem;
        box-shadow: 0 2px 8px rgba(0,0,0,0.06);
        border: 1px solid #e2e8f0;
        transition: all 0.3s ease;
    }
    
    .data-card:hover {
        box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        transform: translateY(-2px);
    }
    
    /* Selectbox styling */
    .stSelectbox > div > div {
        background-color: white;
        border-radius: 8px;
        border: 1.5px solid #e2e8f0;
    }
    
    /* Button styling */
    .stButton > button {
        border-radius: 8px;
        font-weight: 600;
        padding: 0.625rem 1.25rem;
        transition: all 0.2s ease;
        border: none;
    }
    
    .stButton > button:hover {
        transform: translateY(-1px);
        box-shadow: 0 4px 8px rgba(0,0,0,0.15);
    }
    
    /* Expander styling */
    .streamlit-expanderHeader {
        background-color: white;
        border-radius: 8px;
        border: 1px solid #e2e8f0;
        font-weight: 500;
    }
    
    /* Progress bar */
    .stProgress > div > div > div {
        background: linear-gradient(90deg, #3b82f6, #2563eb);
        border-radius: 4px;
    }
    
    /* Tabs styling */
    .stTabs [data-baseweb="tab-list"] {
        gap: 8px;
        background-color: transparent;
    }
    
    .stTabs [data-baseweb="tab"] {
        background-color: white;
        border-radius: 8px 8px 0 0;
        padding: 12px 24px;
        font-weight: 500;
        border: 1px solid #e2e8f0;
    }
    
    .stTabs [aria-selected="true"] {
        background: linear-gradient(180deg, #3b82f6, #2563eb);
        color: white;
        border-color: #2563eb;
    }
    
    /* Info box styling */
    .stAlert {
        background-color: white;
        border-left: 4px solid #3b82f6;
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
        border-top: 2px solid #e2e8f0;
    }
    </style>
    """, unsafe_allow_html=True)

# Title
st.title("Project Planning Guide")
st.markdown("<p style='font-size: 1.1rem; color: #64748b; margin-top: -0.5rem; margin-bottom: 2rem;'>Data Fidelity Navigator - Handle Data Gaps & Review Impacts</p>", unsafe_allow_html=True)
st.markdown("<hr style='margin: 2rem 0; border: none; border-top: 2px solid #e2e8f0;'>", unsafe_allow_html=True)

# Initialize session state
if 'data_inputs' not in st.session_state:
    st.session_state.data_inputs = {
        'building_footprints': True,
        'construction_age': False,
        'energy_consumption': True,
        'building_materials': False,
        'occupancy_data': True,
        'climate_data': True,
        'hvac_systems': False,
        'cost_data': False
    }

if 'selected_proxies' not in st.session_state:
    st.session_state.selected_proxies = {}

# Add custom CSS for enhanced UI design
st.markdown("""
    <style>
    /* Column styling with grey backgrounds */
    div[data-testid="column"] {
        background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
        padding: 1.75rem 1.25rem;
        border-radius: 20px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.08);
        margin: 0 0.5rem;
    }
    
    /* Header styling */
    div[data-testid="column"] h1 {
        color: #1e293b;
        font-size: 1.5rem !important;
        margin-bottom: 1.5rem !important;
        padding-bottom: 0.75rem;
        border-bottom: 3px solid #3b82f6;
    }
    
    /* Subheader styling */
    div[data-testid="column"] h2, div[data-testid="column"] h3 {
        color: #475569;
        font-size: 1.1rem !important;
        margin-top: 1.25rem !important;
        margin-bottom: 0.75rem !important;
    }
    
    /* Expander styling */
    div[data-testid="stExpander"] {
        background: white;
        border-radius: 12px;
        border: 1px solid #e2e8f0;
        margin-bottom: 0.75rem;
        box-shadow: 0 2px 4px rgba(0,0,0,0.04);
    }
    
    /* Button styling */
    div[data-testid="column"] button[kind="primary"] {
        background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
        border-radius: 10px;
        font-weight: 600;
        padding: 0.75rem 1.5rem;
    }
    </style>
""", unsafe_allow_html=True)

# Create three columns for main sections
col1, col2, col3 = st.columns([1, 1.2, 1])

# ==================== COLUMN 1: Analysis Setup ====================
with col1:
    st.header("Step 1: Analysis Setup")

    # Analysis Type
    st.subheader("Analysis Type")
    analysis_type = st.selectbox(
        "Select your analysis:",
        options=[
            "PED Planning",
            "ECOM Planning",
            "Academic Research",
            "Investment Feasibility",
            "Energy Audit",
            "Carbon Assessment",
            "Retrofit Planning"
        ],
        help="Choose the type of analysis you're conducting"
    )

    # Define Scale
    st.subheader("Define Your Scale")
    project_scale = st.selectbox(
        "Project scale:",
        options=["Building", "Neighborhood", "City"],
        help="Select the geographic scope of your analysis"
    )
    
    # Building Uses (only for Neighborhood or City)
    if project_scale in ["Neighborhood", "City"]:
        st.subheader("Building Uses Included")
        st.caption("Select all building types in your analysis:")

        building_uses = {}
        building_uses['Residential'] = st.checkbox("Residential", value=True)
        building_uses['Commercial'] = st.checkbox("Commercial", value=True)
        building_uses['Industrial'] = st.checkbox("Industrial", value=False)
        building_uses['Institutional'] = st.checkbox("Institutional (Schools, Hospitals)", value=True)
        building_uses['Retail'] = st.checkbox("Retail", value=True)
        building_uses['Office'] = st.checkbox("Office", value=False)
        building_uses['Mixed-Use'] = st.checkbox("Mixed-Use", value=True)

        selected_uses = [k for k, v in building_uses.items() if v]

        if selected_uses:
            st.info(f"{len(selected_uses)} building types selected")
    
    # Context
    st.subheader("Context")
    country = st.selectbox(
        "Select country:",
        options=[
            "Sweden",
            "Germany",
            "United Kingdom",
            "Ireland",
            "Norway",
            "Finland",
            "Belgium",
            "France",
            "Denmark"
        ],
        help="Select the country for your analysis"
    )

    # Desired Outputs
    st.subheader("Desired Outputs")
    outputs = st.multiselect(
        "Select outputs:",
        options=[
            "Annual Energy Demand",
            "Peak Power Load",
            "Carbon Emissions",
            "Cost Estimates",
            "Retrofit Prioritization"
        ],
        default=["Annual Energy Demand", "Peak Power Load"]
    )

    if st.button("Next", type="primary", use_container_width=True):
        st.success("Configuration saved")

# ==================== RULES ENGINE: Calculate Everything Dynamically ====================

# Calculate confidence levels based on configuration
confidence_results = calculate_confidence(
    analysis_type=analysis_type,
    data_inputs=st.session_state.data_inputs,
    project_scale=project_scale,
    country=country,
    desired_outputs=outputs
)

# Get recommended proxies for missing data
recommended_proxies = get_recommended_proxies(
    data_inputs=st.session_state.data_inputs,
    analysis_type=analysis_type,
    project_scale=project_scale
)

# Get contextual messages and recommendations
analysis_messages = get_analysis_messages(
    analysis_type=analysis_type,
    data_inputs=st.session_state.data_inputs,
    project_scale=project_scale,
    confidence_score=confidence_results["overall"]
)

# ==================== COLUMN 2: Data Availability ====================
with col2:
    st.header("Step 2: Review Data Inputs")

    st.subheader("Data Inputs")

    # Data categories structure
    data_categories = {
        "Building Geometry": [
            {'label': 'Architectural drawings', 'key': 'architectural_drawings'},
            {'label': 'Building dimensions', 'key': 'building_dimensions'},
            {'label': 'Number of floors', 'key': 'number_of_floors'},
            {'label': 'Roof shape and roof angle', 'key': 'roof_shape_angle'},
            {'label': 'Window to wall ratio (all facades)', 'key': 'window_to_wall_ratio'},
            {'label': 'Building orientation', 'key': 'building_orientation'}
        ],
        "Building Fabric and Construction": [
            {'label': 'Construction materials', 'key': 'construction_materials'},
            {'label': 'Year of construction/renovation', 'key': 'construction_age'},
            {'label': 'Windows properties', 'key': 'window_properties'}
        ],
        "Building System": [
            {'label': 'HVAC system type', 'key': 'hvac_systems'},
            {'label': 'Infiltration rate', 'key': 'infiltration_rate'}
        ],
        "Location Context": [
            {'label': 'Buildings location', 'key': 'building_location'},
            {'label': 'Surroundings height and location', 'key': 'surroundings_data'}
        ],
        "Measured Energy Data": [
            {'label': 'Hourly heating demand', 'key': 'hourly_heating_demand'},
            {'label': 'Hourly electricity consumption', 'key': 'hourly_electricity_consumption'}
        ],
        "Building Use and Operation": [
            {'label': 'Building use type', 'key': 'building_use_type'},
            {'label': 'Occupancy patterns', 'key': 'occupancy_data'},
            {'label': 'Internal gains', 'key': 'internal_gains'},
            {'label': 'Domestic hot water demand', 'key': 'dhw_demand'}
        ]
    }

    # Initialize session state for new data items if not present
    for category, items in data_categories.items():
        for item in items:
            if item['key'] not in st.session_state.data_inputs:
                st.session_state.data_inputs[item['key']] = False

    # Display data items by category with expandable sections
    for category, items in data_categories.items():
        with st.expander(f"**{category}**", expanded=False):
            for item in items:
                checked = st.checkbox(
                    item['label'],
                    value=st.session_state.data_inputs.get(item['key'], False),
                    key=f"checkbox_{item['key']}"
                )
                st.session_state.data_inputs[item['key']] = checked

    # Display Proxy Recommendations Dynamically
    if recommended_proxies:
        st.markdown("<hr style='margin: 1.5rem 0;'>", unsafe_allow_html=True)
        st.subheader("Recommended Proxy Data")
        
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
        
        for data_item, proxy_info in recommended_proxies.items():
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
            
            with st.expander(tier_label, expanded=is_recommended):
                with st.container():
                    st.markdown(f'<div style="background: {bg_gradient}; border-left: 4px solid {border_color}; padding: 1.25rem; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.06);">', unsafe_allow_html=True)
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
    
    # Show scale-specific message
    if confidence_results.get("scale_message"):
        st.markdown("<hr style='margin: 1.5rem 0;'>", unsafe_allow_html=True)
        st.info(f"**Scale Note:** {confidence_results['scale_message']}")
    
    # Show country-specific note
    if confidence_results.get("country_note"):
        st.info(f"**{country}:** {confidence_results['country_note']}")

# ==================== COLUMN 3: Model Output Confidence ====================
with col3:
    st.header("Model Output Confidence")

    # Overall Confidence
    st.subheader("Overall Confidence")
    overall_conf = confidence_results["overall"]
    
    # Determine color based on confidence level
    if overall_conf >= 70:
        conf_color = "#10b981"
        conf_label = "Good"
    elif overall_conf >= 50:
        conf_color = "#f59e0b"
        conf_label = "Medium"
    else:
        conf_color = "#ef4444"
        conf_label = "Low"
    
    col_overall1, col_overall2 = st.columns([2, 1])
    with col_overall1:
        st.markdown(f'<div style="background: linear-gradient(135deg, {conf_color}15, {conf_color}25); padding: 1rem; border-radius: 8px; border-left: 4px solid {conf_color};">'
                   f'<p style="font-size: 2rem; font-weight: 700; color: {conf_color}; margin: 0;">{overall_conf}%</p>'
                   f'<p style="color: #64748b; margin: 0;">{conf_label} Confidence</p></div>', unsafe_allow_html=True)
    
    st.markdown("---")

    # Output-Specific Confidence Levels
    st.subheader("By Output Type")
    
    for output, conf_value in confidence_results["by_output"].items():
        st.markdown(f"**{output}**")
        
        # Determine status and message
        if conf_value >= 70:
            status_color = "#10b981"
            status_msg = "Reliable for most applications"
        elif conf_value >= 50:
            status_color = "#f59e0b"
            status_msg = "Suitable for planning, limited precision"
        else:
            status_color = "#ef4444"
            status_msg = "Low confidence - screening only"
        
        st.progress(conf_value / 100)
        col_conf1, col_conf2 = st.columns([3, 1])
        with col_conf1:
            st.markdown(f'<span style="color: {status_color}; font-size: 0.85rem;">{status_msg}</span>', unsafe_allow_html=True)
        with col_conf2:
            st.markdown(f"**{conf_value}%**")
        
        st.markdown("---")

    # Display Warnings
    if analysis_messages["warnings"]:
        st.subheader("⚠ Warnings")
        for warning in analysis_messages["warnings"]:
            st.warning(warning)

    # Display Limitations
    if analysis_messages["limitations"]:
        st.subheader("Main Limitations")
        for limitation in analysis_messages["limitations"]:
            st.markdown(f"• {limitation}")

    # Display Recommendations
    if analysis_messages["recommendations"]:
        st.markdown("---")
        st.subheader("Recommended Actions")
        for idx, rec in enumerate(analysis_messages["recommendations"], 1):
            st.markdown(f"{idx}. {rec}")

# ==================== BOTTOM SECTION: Visualizations ====================
st.markdown("<hr style='margin: 2.5rem 0;'>", unsafe_allow_html=True)
st.header("Detailed Analysis")

tab1, tab2, tab3 = st.tabs(["Data Coverage", "Confidence Breakdown", "Recommendations"])

with tab1:
    st.subheader("Data Availability Overview")

    # Data coverage chart
    data_items = [
        {"Category": "Building Footprints", "Status": "Available", "Coverage": 100, "Quality": "High"},
        {"Category": "Construction Age", "Status": "Missing", "Coverage": 0, "Quality": "N/A"},
        {"Category": "Energy Consumption", "Status": "Available", "Coverage": 85, "Quality": "Medium"},
        {"Category": "Building Materials", "Status": "Partial", "Coverage": 40, "Quality": "Low"},
        {"Category": "Occupancy Data", "Status": "Available", "Coverage": 75, "Quality": "Medium"},
        {"Category": "Climate Data", "Status": "Available", "Coverage": 100, "Quality": "High"},
    ]

    df_data = pd.DataFrame(data_items)

    fig_coverage = px.bar(
        df_data,
        x="Coverage",
        y="Category",
        color="Status",
        orientation='h',
        title="Data Coverage by Category",
        color_discrete_map={'Available': '#28a745', 'Missing': '#dc3545', 'Partial': '#ffc107'},
        labels={'Coverage': 'Coverage (%)'}
    )
    fig_coverage.update_layout(height=400)
    st.plotly_chart(fig_coverage, use_container_width=True)

    # Data quality table
    st.markdown("**Data Quality Summary:**")
    st.dataframe(df_data, use_container_width=True, hide_index=True)

with tab2:
    st.subheader("Model Confidence Analysis")

    col_chart1, col_chart2 = st.columns(2)

    with col_chart1:
        # Confidence by output type
        confidence_data = pd.DataFrame({
            'Output': ['Annual Energy\nDemand', 'Peak Power\nLoad', 'Retrofit\nPriority', 'Carbon\nEmissions'],
            'Confidence': [60, 35, 70, 55],
            'Category': ['Medium', 'Low', 'High', 'Medium']
        })

        fig_conf = px.bar(
            confidence_data,
            x='Output',
            y='Confidence',
            color='Category',
            title='Confidence by Output Type',
            color_discrete_map={'Low': '#dc3545', 'Medium': '#ffc107', 'High': '#28a745'},
            labels={'Confidence': 'Confidence (%)'}
        )
        fig_conf.update_layout(height=350)
        st.plotly_chart(fig_conf, use_container_width=True)

    with col_chart2:
        # Impact of proxies
        proxy_impact = pd.DataFrame({
            'Proxy Tier': ['Tier 1\n(National)', 'Tier 2\n(Remote)', 'Tier 3\n(Regional)'],
            'Accuracy Impact': [75, 50, 40],
            'Usability': [85, 60, 70]
        })

        fig_proxy = go.Figure()
        fig_proxy.add_trace(go.Bar(
            name='Accuracy Impact',
            x=proxy_impact['Proxy Tier'],
            y=proxy_impact['Accuracy Impact'],
            marker_color='#17a2b8'
        ))
        fig_proxy.add_trace(go.Bar(
            name='Usability',
            x=proxy_impact['Proxy Tier'],
            y=proxy_impact['Usability'],
            marker_color='#6c757d'
        ))
        fig_proxy.update_layout(
            title='Proxy Data Performance',
            barmode='group',
            height=350,
            yaxis_title='Score (%)'
        )
        st.plotly_chart(fig_proxy, use_container_width=True)

    # Sensitivity analysis
    st.markdown("**Sensitivity to Missing Data:**")

    sensitivity_df = pd.DataFrame({
        'Missing Data Item': ['Construction Age', 'Building Materials', 'Occupancy Patterns', 'HVAC Systems'],
        'Impact on Energy': ['High', 'Medium', 'Low', 'High'],
        'Impact on Peak': ['Very High', 'Medium', 'High', 'Very High'],
        'Impact on Cost': ['Medium', 'High', 'Low', 'High']
    })
    st.dataframe(sensitivity_df, use_container_width=True, hide_index=True)

with tab3:
    st.subheader("Data Improvement Recommendations")

    st.markdown("### Priority 1: Critical Data Gaps")

    col_rec1, col_rec2 = st.columns([2, 1])
    
    with col_rec1:
        st.markdown("""
        **Construction Age Data**
        - Current: Missing (using national typology proxy)
        - Impact: Reduces confidence by 25%
        - Recommendation: Survey historical building permits
        - Timeline: 3-6 months
        - Cost: Medium
        """)

    with col_rec2:
        st.metric("Confidence Gain", "+25%", delta="High Impact")
        st.metric("Effort", "Medium")

    st.markdown("---")

    st.markdown("### Priority 2: Quality Enhancement")

    col_rec3, col_rec4 = st.columns([2, 1])
    
    with col_rec3:
        st.markdown("""
        **Building Materials Database**
        - Current: 40% coverage with regional averages
        - Impact: Moderate uncertainty in envelope performance
        - Recommendation: Thermal imaging survey for sample buildings
        - Timeline: 2-4 months
        - Cost: Low-Medium
        """)

    with col_rec4:
        st.metric("Confidence Gain", "+15%", delta="Medium Impact")
        st.metric("Effort", "Low")

    st.markdown("---")

    st.markdown("### Action Plan")
    
    action_plan = pd.DataFrame({
        'Phase': ['Phase 1', 'Phase 2', 'Phase 3', 'Phase 4'],
        'Action': [
            'Collect construction age from permits',
            'Conduct thermal imaging survey',
            'Deploy smart meter pilot program',
            'Validate results against sample buildings'
        ],
        'Duration': ['3 months', '2 months', '6 months', '1 month'],
        'Expected Confidence': ['60% → 75%', '75% → 82%', '82% → 90%', '90% → 95%']
    })

    st.dataframe(action_plan, use_container_width=True, hide_index=True)

    # ROI Calculator
    st.markdown("---")
    st.markdown("### Investment vs. Confidence Gain")

    investment = st.slider("Investment Budget ($1000s)", 0, 500, 100)

    # Simple model: confidence increases with investment but with diminishing returns
    base_confidence = 60
    max_confidence = 95
    confidence_improvement = (max_confidence - base_confidence) * (1 - 0.95 ** (investment / 50))
    new_confidence = min(base_confidence + confidence_improvement, max_confidence)

    col_roi1, col_roi2, col_roi3 = st.columns(3)
    with col_roi1:
        st.metric("Current Confidence", f"{base_confidence}%")
    with col_roi2:
        st.metric("Projected Confidence", f"{new_confidence:.1f}%", f"+{confidence_improvement:.1f}%")
    with col_roi3:
        st.metric("Cost per % Point", f"${investment * 1000 / max(confidence_improvement, 1):.0f}")

# Footer
st.markdown("<hr style='margin: 2rem 0;'>", unsafe_allow_html=True)
col_foot1, col_foot2, col_foot3 = st.columns(3)

with col_foot1:
    if st.button("Back to Setup", use_container_width=True):
        st.info("Navigate to Step 1")

with col_foot2:
    if st.button("Save Configuration", type="primary", use_container_width=True):
        st.success("Configuration saved!")
        st.balloons()

with col_foot3:
    if st.button("Export Report", use_container_width=True):
        st.info("Report generation coming soon")

st.markdown("---")
st.markdown(f"<p style='text-align: center; color: #64748b; font-size: 0.9rem;'>Project Planning Guide v1.0 | Analysis: {analysis_type} | Scale: {project_scale} | Country: {country}</p>", unsafe_allow_html=True)
