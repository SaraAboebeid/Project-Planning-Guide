import streamlit as st
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from datetime import datetime
import random

# Page configuration
st.set_page_config(page_title="Project Planning Guide", layout="wide")

# Custom CSS
st.markdown("""
    <style>
    .main {
        padding: 0rem 1rem;
    }
    .stMetric {
        background-color: #f0f2f6;
        padding: 10px;
        border-radius: 5px;
    }
    .available-badge {
        background-color: #28a745;
        color: white;
        padding: 3px 10px;
        border-radius: 12px;
        font-size: 12px;
        font-weight: bold;
    }
    .missing-badge {
        background-color: #dc3545;
        color: white;
        padding: 3px 10px;
        border-radius: 12px;
        font-size: 12px;
        font-weight: bold;
    }
    .medium-badge {
        background-color: #ffc107;
        color: black;
        padding: 3px 10px;
        border-radius: 12px;
        font-size: 12px;
        font-weight: bold;
    }
    .high-badge {
        background-color: #dc3545;
        color: white;
        padding: 3px 10px;
        border-radius: 12px;
        font-size: 12px;
        font-weight: bold;
    }
    </style>
    """, unsafe_allow_html=True)

# Title
st.title("Project Planning Guide")
st.markdown("### Data Fidelity Navigator - Handle Data Gaps & Review Impacts")
st.markdown("---")

# Initialize session state
if 'data_inputs' not in st.session_state:
    st.session_state.data_inputs = {
        'building_footprints': True,
        'construction_age': False,
        'energy_consumption': True,
        'building_materials': False,
        'occupancy_data': True,
        'climate_data': True
    }

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

# ==================== COLUMN 2: Data Availability ====================
with col2:
    st.header("Step 2: Review Data Inputs")

    st.subheader("Data Inputs")

    # Available Data
    with st.container():
        st.markdown('<div style="border: 2px solid #28a745; border-radius: 5px; padding: 10px; margin-bottom: 10px;">', unsafe_allow_html=True)
        col_check1, col_check2 = st.columns([3, 1])
        with col_check1:
            st.markdown("**Building Footprints**")
            st.caption("• Detailed footprints map available")
        with col_check2:
            st.markdown('<span class="available-badge">Available</span>', unsafe_allow_html=True)
        st.markdown('</div>', unsafe_allow_html=True)

    # Missing Data
    with st.container():
        st.markdown('<div style="border: 2px solid #dc3545; border-radius: 5px; padding: 10px; margin-bottom: 10px;">', unsafe_allow_html=True)
        col_check1, col_check2 = st.columns([3, 1])
        with col_check1:
            st.markdown("**Construction Age**")
            st.caption("• No building age data available")
        with col_check2:
            st.markdown('<span class="missing-badge">Missing</span>', unsafe_allow_html=True)
        st.markdown('</div>', unsafe_allow_html=True)

    # Proxy Recommendations
    st.markdown("---")
    tier_expanded = st.checkbox("Tier 1 Proxy (Recommended)", value=True)

    if tier_expanded:
        with st.container():
            st.markdown('<div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 10px; border-radius: 5px;">', unsafe_allow_html=True)
            st.markdown("**National typology by age period**")
            st.markdown('<span class="medium-badge">Medium</span>', unsafe_allow_html=True)

            st.caption("• Annual heating demand, Retrofit ranking")

            col_acc1, col_acc2, col_acc3 = st.columns(3)
            with col_acc1:
                st.markdown("**Scenario Planning**")
            with col_acc2:
                st.markdown("**Comparative Studies**")
            with col_acc3:
                st.markdown("**Detailed Analysis**")
            st.markdown('</div>', unsafe_allow_html=True)

    tier2_expanded = st.checkbox("Tier 2 Proxy")
    if tier2_expanded:
        with st.container():
            st.markdown('<div style="background-color: #f8d7da; border-left: 4px solid #dc3545; padding: 10px; border-radius: 5px;">', unsafe_allow_html=True)
            st.markdown("**Inferred age from remote sensing**")
            st.markdown('<span class="high-badge">High</span>', unsafe_allow_html=True)

            st.caption("• Acceptable for: Urban Screening / Comparative Studies")
            st.markdown('</div>', unsafe_allow_html=True)

    tier3_expanded = st.checkbox("Tier 3 Proxy")
    if tier3_expanded:
        with st.container():
            st.markdown('<div style="background-color: #f8d7da; border-left: 4px solid #dc3545; padding: 10px; border-radius: 5px;">', unsafe_allow_html=True)
            st.markdown("**Regional averages**")
            st.markdown('<span class="high-badge">High</span>', unsafe_allow_html=True)

            st.caption("• Acceptable for: Scenario Planning / Retrofit ranking")
            st.markdown('</div>', unsafe_allow_html=True)

    # Additional data items
    st.markdown("---")
    st.subheader("Other Data Items")

    with st.expander("Energy Consumption Data - Available"):
        st.caption("Metered data from local utility")
        st.progress(0.9)

    with st.expander("Building Materials - Missing"):
        st.caption("Proxy: National construction standards by decade")
        st.progress(0.4)

# ==================== COLUMN 3: Model Output Confidence ====================
with col3:
    st.header("Model Output Confidence")

    # Confidence Metrics
    st.subheader("Output Confidence Levels")

    # Annual Energy Demand
    confidence_energy = 60
    st.markdown("**Annual Heating Demand**")
    st.progress(confidence_energy / 100)
    col_conf1, col_conf2 = st.columns([3, 1])
    with col_conf1:
        st.caption("Reliable for scenario planning")
    with col_conf2:
        st.markdown(f"**{confidence_energy}%**")

    st.markdown("---")

    # Peak Power
    confidence_peak = 35
    st.markdown("**Peak Heating Power**")
    st.progress(confidence_peak / 100)
    col_conf1, col_conf2 = st.columns([3, 1])
    with col_conf1:
        st.markdown('<span style="color: #dc3545;">Low Confidence</span>', unsafe_allow_html=True)
        st.caption("High uncertainty from missing data")
    with col_conf2:
        st.markdown(f"**{confidence_peak}%**")

    st.markdown("---")

    # Retrofit Prioritization
    confidence_retrofit = 70
    st.markdown("**Retrofit Prioritization**")
    st.progress(confidence_retrofit / 100)
    col_conf1, col_conf2 = st.columns([3, 1])
    with col_conf1:
        st.caption("Good for comparative ranking")
    with col_conf2:
        st.markdown(f"**{confidence_retrofit}%**")

    # Main Limitations
    st.markdown("---")
    st.subheader("Main Limitations")
    st.markdown("""
    • Retrofit rankings biased due to age assumptions

    • Peak power unreliable from remote sensing data

    • Individual building accuracy limited
    """)

    # Recommended Upgrades
    st.markdown("---")
    st.subheader("Recommended Upgrades")
    st.markdown("""
    **Priority Actions:**
    
    Gather metered heating data to improve accuracy
    
    Vote for local building registry to track construction
    
    Survey sample buildings for validation
    """)

    # Contacts
    st.markdown("---")
    st.subheader("More Contacts")
    st.markdown("""
    Campordats: resilperctee for summation
    
    Gather lowful data & suggeotions for future now
    
    Using alor-firm leading.388 for improvement, data
    """)

# ==================== BOTTOM SECTION: Visualizations ====================
st.markdown("---")
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
st.markdown("---")
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
st.caption(f"Project Planning Guide v1.0 | Analysis: {analysis_type} | Scale: {project_scale}")
