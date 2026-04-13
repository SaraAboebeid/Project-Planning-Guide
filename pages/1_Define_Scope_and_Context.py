"""
Page 1: Define Scope & Context

This page allows users to select analysis types, focus areas, scale, 
building uses, and country context - matching the original wizard functionality.
"""

import streamlit as st
import pydeck as pdk
from utils.shared_css import inject_shared_css, render_step_indicator
from utils.location_data import geocode_address, get_nearby_epc_snapshot, has_location_database

st.set_page_config(page_title="Define Scope", layout="wide")

# Inject shared MD3 button / theme CSS
inject_shared_css()

# Hide the sidebar pages navigation
st.markdown("""
<style>
    [data-testid="stSidebarNav"] {display: none;}
    section[data-testid="stSidebar"] {display: none;}
</style>
""", unsafe_allow_html=True)

# Persistent step progress indicator
render_step_indicator(1)
st.markdown("<h2 style='font-size:1.5rem; font-weight:700; color:#0f172a; letter-spacing:-0.01em; margin-bottom:0.5rem;'>Step 1: Define Scope & Context</h2>", unsafe_allow_html=True)
st.markdown(
    "<p style='font-size:0.92rem; color:#64748b; margin-top:-0.5rem; margin-bottom:0.7rem;'>Select the analysis type, focus, and basic context for your project.</p>",
    unsafe_allow_html=True
)

# ============================================================================
# ANALYSIS TYPE SELECTION
# ============================================================================


st.markdown("<div style='font-size:1.02rem; font-weight:600; margin-bottom:0.2rem;'>Analysis Type <span style='color:#dc2626'>*</span></div>", unsafe_allow_html=True)

analysis_type = st.multiselect(
    "Select your analysis (one or more):",
    options=[
        "Energy & Carbon Performance",
        "Renewable Energy & Local Production",
        "Retrofit & Transformation",
        "Urban Design Support",
        "Climate Resilience"
    ],
    default=st.session_state.get("analysis_type", []),
    placeholder="Select one or more analysis types...",
    help="Choose one or more analysis types.",
    key="analysis_type_select",
    label_visibility="collapsed"
)

# Store in session state
st.session_state["analysis_type"] = analysis_type

if analysis_type:
    st.caption(f"{len(analysis_type)} analysis type(s) selected")

# ============================================================================
# FOLLOW-UP OPTIONS BASED ON ANALYSIS TYPE
# ============================================================================

# Energy & Carbon Performance - Focus area
if "Energy & Carbon Performance" in analysis_type:

    st.markdown("<div style='font-size:1.02rem; font-weight:600; margin-bottom:0.2rem;'>Focus area (select one)</div>", unsafe_allow_html=True)
    focus_options = [
        "Electricity",
        "Heating/Cooling",
        "Whole system interaction",
    ]
    current_focus = st.session_state.get("energy_system_focus", None)
    focus_index = focus_options.index(current_focus) if current_focus in focus_options else 0
    
    st.session_state.energy_system_focus = st.radio(
        "Focus area",
        options=focus_options,
        index=focus_index,
        horizontal=True,
        key="energy_system_focus_radio",
        label_visibility="collapsed"
    )
    st.session_state["analysis_focus"] = st.session_state.energy_system_focus
else:
    st.session_state.energy_system_focus = None
    if "Energy & Carbon Performance" not in analysis_type:
        st.session_state["analysis_focus"] = None

# Renewable Energy & Local Production - Renewable types
if "Renewable Energy & Local Production" in analysis_type:

    st.markdown("<div style='font-size:1.02rem; font-weight:600; margin-bottom:0.2rem;'>Renewable energy types (select one or more)</div>", unsafe_allow_html=True)
    renewable_options = [
        "Battery Storage",
        "Biomass",
        "Geothermal",
        "Hydropower",
        "Offshore Wind",
        "Onshore Wind",
        "Solar PV",
        "Solar Thermal",
    ]
    cols = st.columns(2)
    selected_re = []
    for i, opt in enumerate(renewable_options):
        opt_key = f"renewable_{opt.replace(' ', '_').lower()}"
        with cols[i % 2]:
            if st.checkbox(opt, value=opt in st.session_state.get("renewable_types", []), key=opt_key):
                selected_re.append(opt)
    st.session_state.renewable_types = selected_re
else:
    st.session_state.renewable_types = []

# Urban Design Support - Urban design focus
if "Urban Design Support" in analysis_type:

    st.markdown("<div style='font-size:1.02rem; font-weight:600; margin-bottom:0.2rem;'>Urban design focus (select one or more)</div>", unsafe_allow_html=True)
    urban_design_options = [
        "Accessibility",
        "Amenities Demand",
        "Ecosystem & Habitat",
        "Noise",
        "Parking Studies",
        "Traffic & Congestion",
        "Urban Heat Island",
    ]
    cols = st.columns(2)
    selected_ud = []
    for i, opt in enumerate(urban_design_options):
        opt_key = f"urban_design_{opt.replace(' ', '_').replace('&', 'and').lower()}"
        with cols[i % 2]:
            if st.checkbox(opt, value=opt in st.session_state.get("urban_design_types", []), key=opt_key):
                selected_ud.append(opt)
    st.session_state.urban_design_types = selected_ud
else:
    st.session_state.urban_design_types = []

# Climate Resilience - Climate resilience focus
if "Climate Resilience" in analysis_type:

    st.markdown("<div style='font-size:1.02rem; font-weight:600; margin-bottom:0.2rem;'>Climate resilience focus (select one or more)</div>", unsafe_allow_html=True)
    climate_options = [
        "Climate Projections",
        "Cooling Demand Impact",
        "Extreme Heat Analysis",
        "Flood Risk Assessment",
        "Wind & Ventilation Analysis",
    ]
    cols = st.columns(2)
    selected_cr = []
    for i, opt in enumerate(climate_options):
        opt_key = f"climate_{opt.replace(' ', '_').replace('&', 'and').lower()}"
        with cols[i % 2]:
            if st.checkbox(opt, value=opt in st.session_state.get("climate_resilience_types", []), key=opt_key):
                selected_cr.append(opt)
    st.session_state.climate_resilience_types = selected_cr
    
    # Show note about Flood Risk Assessment scale restriction
    if "Flood Risk Assessment" in selected_cr:
        st.caption("Flood Risk Assessment is only available at Neighborhood or City scale")
else:
    st.session_state.climate_resilience_types = []

# ============================================================================
# SCALE SELECTION
# ============================================================================


st.markdown("<div style='font-size:1.02rem; font-weight:600; margin-bottom:0.2rem;'>Define Your Scale <span style='color:#dc2626'>*</span></div>", unsafe_allow_html=True)

# Determine available scale options based on analysis type selection
climate_types = st.session_state.get("climate_resilience_types", [])
urban_design_only = analysis_type == ["Urban Design Support"]
flood_risk_only = (analysis_type == ["Climate Resilience"] and climate_types == ["Flood Risk Assessment"])

if urban_design_only or flood_risk_only:
    scale_options = ["Neighborhood", "City"]
    if urban_design_only:
        scale_help = "Urban Design Support is only available at Neighborhood or City scale"
    else:
        scale_help = "Flood Risk Assessment is only available at Neighborhood or City scale"
    # Reset scale if Building was previously selected
    if st.session_state.get("project_scale") == "Building":
        st.session_state.project_scale = None
else:
    scale_options = ["Building", "Neighborhood", "City"]
    scale_help = "Select the geographic scope of your analysis"

# Get current scale value for index
current_scale = st.session_state.get("project_scale")
scale_index = scale_options.index(current_scale) if current_scale in scale_options else None

project_scale = st.selectbox(
    "Project scale:",
    options=scale_options,
    index=scale_index,
    placeholder="Choose option",
    help=scale_help,
    key="project_scale_select",
    label_visibility="collapsed"
)

st.session_state["project_scale"] = project_scale
st.session_state["analysis_scale"] = project_scale

# ============================================================================
# BUILDING USES (only for Neighborhood scale)
# ============================================================================

if project_scale == "Neighborhood":

    st.markdown("<div style='font-size:1.02rem; font-weight:600; margin-bottom:0.2rem;'>Building Uses Included</div>", unsafe_allow_html=True)
    st.caption("<span style='font-size:0.93rem;'>Select all building types in your analysis:</span>", unsafe_allow_html=True)

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
    cols = st.columns(2)
    with cols[0]:
        building_uses['Residential'] = st.checkbox("Residential", value=st.session_state.get('use_residential', False), key='use_residential')
        building_uses['Commercial'] = st.checkbox("Commercial", value=st.session_state.get('use_commercial', False), key='use_commercial')
        building_uses['Industrial'] = st.checkbox("Industrial", value=st.session_state.get('use_industrial', False), key='use_industrial')
        building_uses['School'] = st.checkbox("School", value=st.session_state.get('use_school', False), key='use_school')
    with cols[1]:
        building_uses['Hospital'] = st.checkbox("Hospital", value=st.session_state.get('use_hospital', False), key='use_hospital')
        building_uses['Sports Facilities'] = st.checkbox("Sports Facilities", value=st.session_state.get('use_sports', False), key='use_sports')
        building_uses['Office'] = st.checkbox("Office", value=st.session_state.get('use_office', False), key='use_office')
        building_uses['Mixed-Use'] = st.checkbox("Mixed-Use", value=st.session_state.get('use_mixed_use', False), key='use_mixed_use')

    selected_uses = [k for k, v in building_uses.items() if v]
    st.session_state["building_uses"] = selected_uses

    if selected_uses:
        st.info(f"{len(selected_uses)} building types selected")

# ============================================================================
# CONTEXT (COUNTRY)
# ============================================================================


st.markdown("<div style='font-size:1.02rem; font-weight:600; margin-bottom:0.2rem;'>Context <span style='color:#dc2626'>*</span></div>", unsafe_allow_html=True)

# Get current country value for index
current_country = st.session_state.get("country")
country_options = ["Belgium", "Ireland", "Sweden", "United Kingdom"]
country_index = country_options.index(current_country) if current_country in country_options else None

country = st.selectbox(
    "Select country:",
    options=country_options,
    index=country_index,
    placeholder="Choose option",
    help="Select the country for your analysis",
    key="country_select",
    label_visibility="collapsed"
)

st.session_state["country"] = country
st.session_state["analysis_context"] = country

# ============================================================================
# PROJECT DETAILS (Optional)
# ============================================================================


st.markdown("<div style='font-size:1.02rem; font-weight:600; margin-bottom:0.2rem;'>Project Details</div>", unsafe_allow_html=True)
col_a, col_b = st.columns(2)
with col_a:
    st.session_state["project_name"] = st.text_input(
        "Project Name", 
        value=st.session_state.get("project_name", ""),
        placeholder="Enter project name..."
    )
with col_b:
    st.session_state["location"] = st.text_input(
        "Location / Address", 
        value=st.session_state.get("location", ""),
        placeholder="Enter location..."
    )

# ============================================================================
# LOCATION MAP & AVAILABLE DATA SNAPSHOT (DuckDB)
# ============================================================================

st.markdown("<div style='font-size:1.02rem; font-weight:600; margin-bottom:0.2rem;'>Project Location Map</div>", unsafe_allow_html=True)

if not has_location_database():
    st.info("Location dataset not found: data/sensitivity/epc_sweden.duckdb")
else:
    st.caption("Search an address, place it on the map, and preview available nearby EPC data.")

    col_map_a, col_map_b, col_map_c = st.columns([2, 1, 1])
    with col_map_a:
        location_query = st.text_input(
            "Project address",
            value=st.session_state.get("location", ""),
            placeholder="Example: Johanneberg, Gothenburg",
            key="project_location_query",
        )
    with col_map_b:
        radius_m = st.slider(
            "Search radius (m)",
            min_value=300,
            max_value=3000,
            step=100,
            value=int(st.session_state.get("location_radius_m", 800)),
            key="location_radius_m",
        )
    with col_map_c:
        st.markdown("<div style='height:1.65rem;'></div>", unsafe_allow_html=True)
        locate_clicked = st.button("Locate & Load Data", use_container_width=True, key="locate_project_btn")

    if locate_clicked:
        if not location_query.strip():
            st.warning("Please enter an address before locating on map.")
        else:
            try:
                geocoded = geocode_address(location_query, st.session_state.get("country", "Sweden"))
                if not geocoded:
                    st.warning("No map location found for that address. Try a city + street format.")
                else:
                    st.session_state["location"] = location_query
                    st.session_state["project_lat"] = geocoded["lat"]
                    st.session_state["project_lon"] = geocoded["lon"]
                    st.session_state["project_location_label"] = geocoded["display_name"]
            except Exception as exc:
                st.error(f"Could not geocode this address: {exc}")

    if "project_lat" in st.session_state and "project_lon" in st.session_state:
        lat = float(st.session_state["project_lat"])
        lon = float(st.session_state["project_lon"])
        label = st.session_state.get("project_location_label", "Selected location")

        snapshot = get_nearby_epc_snapshot(lat, lon, radius_m=radius_m)
        summary = snapshot["summary"]
        points_df = snapshot["points"]
        classes_df = snapshot["classes"]
        sample_df = snapshot["sample"]

        st.session_state["location_data_summary"] = summary
        st.session_state["location_classes"] = classes_df.to_dict("records")
        st.session_state["location_sample"] = sample_df.to_dict("records")

        st.markdown(
            f"<div style='font-size:0.9rem; color:#475569; margin-top:0.4rem;'><b>Selected location:</b> {label}</div>",
            unsafe_allow_html=True,
        )

        if not points_df.empty:
            map_data = points_df[["lat", "lon"]].copy()
            map_data["kind"] = "Nearby footprint"
        else:
            map_data = points_df

        project_point = [{"lat": lat, "lon": lon, "kind": "Project location"}]

        st.pydeck_chart(
            pdk.Deck(
                map_style="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
                initial_view_state=pdk.ViewState(
                    latitude=lat,
                    longitude=lon,
                    zoom=14,
                    pitch=42,
                ),
                layers=[
                    pdk.Layer(
                        "ScatterplotLayer",
                        data=map_data,
                        get_position="[lon, lat]",
                        get_radius=22,
                        get_fill_color=[51, 169, 160, 135],
                        pickable=True,
                    ),
                    pdk.Layer(
                        "ScatterplotLayer",
                        data=project_point,
                        get_position="[lon, lat]",
                        get_radius=70,
                        get_fill_color=[196, 232, 29, 230],
                        pickable=True,
                    ),
                ],
                tooltip={"text": "{kind}"},
            ),
            use_container_width=True,
        )
        st.caption("If the basemap does not render on your network, the points and metrics below are still valid.")

        m1, m2, m3, m4 = st.columns(4)
        m1.metric("Nearby buildings", f"{summary['footprint_buildings']:,}")
        m2.metric("EPC records", f"{summary['epc_records']:,}")
        m3.metric("Has energy class", f"{summary['has_energy_class']:,}")
        m4.metric("Has energy performance", f"{summary['has_energy_performance']:,}")

        with st.expander("Preview local data found near this location"):
            col_c1, col_c2 = st.columns([1, 1.4])
            with col_c1:
                st.markdown("**Energy class distribution (top values)**")
                if classes_df.empty:
                    st.caption("No EPC class records found in selected radius.")
                else:
                    st.dataframe(classes_df, use_container_width=True, hide_index=True)
            with col_c2:
                st.markdown("**Sample EPC records**")
                if sample_df.empty:
                    st.caption("No address-level EPC records found in selected radius.")
                else:
                    st.dataframe(sample_df, use_container_width=True, hide_index=True)

# ============================================================================
# NAVIGATION
# ============================================================================

st.markdown("---")
col1, col2, col3 = st.columns([1, 1, 2])

with col1:
    if st.button("Back", use_container_width=True, key="nav_back_1"):
        st.switch_page("planning_guide.py")

with col2:
    if st.button("Continue", type="primary", use_container_width=True, key="nav_next_1"):
        # Validation
        missing = []
        if not analysis_type:
            missing.append("analysis type")
        if not project_scale:
            missing.append("project scale")
        if not country:
            missing.append("country")
        
        if missing:
            st.warning("Please select: " + ", ".join(missing) + " before proceeding.")
        else:
            st.switch_page("pages/2_Review_Data.py")

with col3:
    st.markdown(
        "<div style='text-align: right; color: #94a3b8; font-size: 0.85rem; padding-top: 0.5rem;'>"
        "Step 1 of 6</div>",
        unsafe_allow_html=True
    )
