"""
Page 0: Define Project  (Step 1+)

Alternative, project-intent-driven scoping page.
Selects project type → systems in scope → KPIs → scale → context,
then translates into the session-state keys Steps 2-6 expect.
"""

import streamlit as st
from config.project_types import (
    PROJECT_TYPES,
    PROJECT_TYPE_DESCRIPTIONS,
    SYSTEMS_BY_PROJECT_TYPE,
    KPIS_BY_PROJECT_TYPE,
    translate_to_legacy_keys,
)
from utils.shared_css import inject_shared_css, render_step_indicator

st.set_page_config(page_title="Define Project", layout="wide")

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

st.markdown(
    "<h2 style='font-size:1.5rem; font-weight:700; color:#0f172a; "
    "letter-spacing:-0.01em; margin-bottom:0.5rem;'>"
    "Step 1+: Define Project</h2>",
    unsafe_allow_html=True,
)
st.markdown(
    "<p style='font-size:0.92rem; color:#64748b; margin-top:-0.5rem; "
    "margin-bottom:0.7rem;'>"
    "Select your project type, systems in scope, KPIs, and context.</p>",
    unsafe_allow_html=True,
)

# ============================================================================
# PROJECT TYPE
# ============================================================================

st.markdown(
    "<div style='font-size:1.02rem; font-weight:600; margin-bottom:0.2rem;'>"
    "Project Type <span style='color:#dc2626'>*</span></div>",
    unsafe_allow_html=True,
)

current_pt = st.session_state.get("project_type")
pt_index = PROJECT_TYPES.index(current_pt) if current_pt in PROJECT_TYPES else None

project_type = st.selectbox(
    "Project Type",
    options=PROJECT_TYPES,
    index=pt_index,
    placeholder="Choose a project type...",
    key="project_type_select",
    label_visibility="collapsed",
)
st.session_state["project_type"] = project_type

# Show description for the selected type
if project_type:
    desc = PROJECT_TYPE_DESCRIPTIONS.get(project_type, "")
    st.caption(desc)

# ── Reset systems / KPI checkboxes when project type changes ────────
prev_pt = st.session_state.get("_prev_project_type")
if project_type is not None and project_type != prev_pt:
    if prev_pt is not None:
        for key in list(st.session_state.keys()):
            if key.startswith("sys1p_") or key.startswith("kpi1p_"):
                del st.session_state[key]
    st.session_state["_prev_project_type"] = project_type
    if prev_pt is not None:
        st.rerun()

# ============================================================================
# SYSTEMS IN SCOPE
# ============================================================================

if project_type:
    st.markdown(
        "<hr style='margin: 0.8rem 0 1rem 0; border: none; "
        "border-top: 1px solid #e2e8f0;'>",
        unsafe_allow_html=True,
    )
    st.markdown(
        "<div style='font-size:1.02rem; font-weight:600; margin-bottom:0.2rem;'>"
        "Systems in Scope <span style='color:#dc2626'>*</span></div>",
        unsafe_allow_html=True,
    )
    st.caption("Select the systems relevant to your project:")

    available_systems = SYSTEMS_BY_PROJECT_TYPE.get(project_type, [])
    cols = st.columns(2)
    selected_systems = []
    for i, sys_name in enumerate(available_systems):
        sys_key = (
            "sys1p_"
            + sys_name.replace(" ", "_")
            .replace("(", "")
            .replace(")", "")
            .replace(",", "")
            .lower()
        )
        with cols[i % 2]:
            if st.checkbox(sys_name, key=sys_key):
                selected_systems.append(sys_name)

    st.session_state["systems_in_scope"] = selected_systems

    if selected_systems:
        st.caption(f"{len(selected_systems)} system(s) selected")

# ============================================================================
# KEY PERFORMANCE INDICATORS
# ============================================================================

if project_type:
    st.markdown(
        "<hr style='margin: 0.8rem 0 1rem 0; border: none; "
        "border-top: 1px solid #e2e8f0;'>",
        unsafe_allow_html=True,
    )
    st.markdown(
        "<div style='font-size:1.02rem; font-weight:600; margin-bottom:0.2rem;'>"
        "Key Performance Indicators <span style='color:#dc2626'>*</span></div>",
        unsafe_allow_html=True,
    )
    st.caption("Select the KPIs you want to evaluate:")

    available_kpis = KPIS_BY_PROJECT_TYPE.get(project_type, [])
    cols = st.columns(2)
    selected_kpis = []
    for i, kpi in enumerate(available_kpis):
        kpi_key = (
            "kpi1p_"
            + kpi.replace(" ", "_")
            .replace("/", "_")
            .replace("(", "")
            .replace(")", "")
            .lower()
        )
        with cols[i % 2]:
            if st.checkbox(kpi, key=kpi_key):
                selected_kpis.append(kpi)

    st.session_state["selected_kpis"] = selected_kpis

    if selected_kpis:
        st.caption(f"{len(selected_kpis)} KPI(s) selected")

# ============================================================================
# SCALE SELECTION
# ============================================================================

st.markdown(
    "<hr style='margin: 0.8rem 0 1rem 0; border: none; "
    "border-top: 1px solid #e2e8f0;'>",
    unsafe_allow_html=True,
)
st.markdown(
    "<div style='font-size:1.02rem; font-weight:600; margin-bottom:0.2rem;'>"
    "Scale <span style='color:#dc2626'>*</span></div>",
    unsafe_allow_html=True,
)

scale_options = ["Building", "Neighborhood", "City"]
current_scale = st.session_state.get("project_scale")
scale_index = (
    scale_options.index(current_scale) if current_scale in scale_options else None
)

project_scale = st.selectbox(
    "Project scale:",
    options=scale_options,
    index=scale_index,
    placeholder="Choose option",
    help="Select the geographic scope of your project",
    key="p1p_scale_select",
    label_visibility="collapsed",
)
st.session_state["project_scale"] = project_scale
st.session_state["analysis_scale"] = project_scale

# ============================================================================
# BUILDING USES  (Neighborhood only)
# ============================================================================

if project_scale == "Neighborhood":
    st.markdown(
        "<hr style='margin: 0.8rem 0 1rem 0; border: none; "
        "border-top: 1px solid #e2e8f0;'>",
        unsafe_allow_html=True,
    )
    st.markdown(
        "<div style='font-size:1.02rem; font-weight:600; margin-bottom:0.2rem;'>"
        "Building Uses Included</div>",
        unsafe_allow_html=True,
    )
    st.caption("Select all building types in your analysis:")

    col_a, col_b = st.columns(2)
    if col_a.button("Select all", key="p1p_btn_select_uses"):
        for _k in [
            "p1p_use_residential", "p1p_use_commercial", "p1p_use_industrial",
            "p1p_use_school", "p1p_use_hospital", "p1p_use_sports",
            "p1p_use_office", "p1p_use_mixed_use",
        ]:
            st.session_state[_k] = True
        st.rerun()
    if col_b.button("Unselect all", key="p1p_btn_unselect_uses"):
        for _k in [
            "p1p_use_residential", "p1p_use_commercial", "p1p_use_industrial",
            "p1p_use_school", "p1p_use_hospital", "p1p_use_sports",
            "p1p_use_office", "p1p_use_mixed_use",
        ]:
            st.session_state[_k] = False
        st.rerun()

    building_uses = {}
    cols = st.columns(2)
    with cols[0]:
        building_uses["Residential"] = st.checkbox(
            "Residential", key="p1p_use_residential"
        )
        building_uses["Commercial"] = st.checkbox(
            "Commercial", key="p1p_use_commercial"
        )
        building_uses["Industrial"] = st.checkbox(
            "Industrial", key="p1p_use_industrial"
        )
        building_uses["School"] = st.checkbox("School", key="p1p_use_school")
    with cols[1]:
        building_uses["Hospital"] = st.checkbox("Hospital", key="p1p_use_hospital")
        building_uses["Sports Facilities"] = st.checkbox(
            "Sports Facilities", key="p1p_use_sports"
        )
        building_uses["Office"] = st.checkbox("Office", key="p1p_use_office")
        building_uses["Mixed-Use"] = st.checkbox(
            "Mixed-Use", key="p1p_use_mixed_use"
        )

    selected_uses = [k for k, v in building_uses.items() if v]
    st.session_state["building_uses"] = selected_uses

    if selected_uses:
        st.info(f"{len(selected_uses)} building type(s) selected")

# ============================================================================
# CONTEXT  (Country)
# ============================================================================

st.markdown(
    "<hr style='margin: 0.8rem 0 1rem 0; border: none; "
    "border-top: 1px solid #e2e8f0;'>",
    unsafe_allow_html=True,
)
st.markdown(
    "<div style='font-size:1.02rem; font-weight:600; margin-bottom:0.2rem;'>"
    "Context <span style='color:#dc2626'>*</span></div>",
    unsafe_allow_html=True,
)

country_options = ["Belgium", "Ireland", "Sweden", "United Kingdom"]
current_country = st.session_state.get("country")
country_index = (
    country_options.index(current_country)
    if current_country in country_options
    else None
)

country = st.selectbox(
    "Select country:",
    options=country_options,
    index=country_index,
    placeholder="Choose option",
    help="Select the country for your project",
    key="p1p_country_select",
    label_visibility="collapsed",
)
st.session_state["country"] = country
st.session_state["analysis_context"] = country

# ============================================================================
# PROJECT DETAILS  (Optional)
# ============================================================================

st.markdown(
    "<hr style='margin: 0.8rem 0 1rem 0; border: none; "
    "border-top: 1px solid #e2e8f0;'>",
    unsafe_allow_html=True,
)
st.markdown(
    "<div style='font-size:1.02rem; font-weight:600; margin-bottom:0.2rem;'>"
    "Project Details</div>",
    unsafe_allow_html=True,
)

col_a, col_b = st.columns(2)
with col_a:
    st.session_state["project_name"] = st.text_input(
        "Project Name",
        value=st.session_state.get("project_name", ""),
        placeholder="Enter project name...",
        key="p1p_project_name",
    )
with col_b:
    st.session_state["location"] = st.text_input(
        "Location / Address",
        value=st.session_state.get("location", ""),
        placeholder="Enter location...",
        key="p1p_location",
    )

# ============================================================================
# NAVIGATION
# ============================================================================

st.markdown("---")
col1, col2, col3 = st.columns([1, 1, 2])

with col1:
    if st.button("Back", use_container_width=True, key="p1p_nav_back"):
        st.switch_page("planning_guide.py")

with col2:
    if st.button("Continue", type="primary", use_container_width=True, key="p1p_nav_next"):
        # ── Validation ──
        missing = []
        if not project_type:
            missing.append("project type")
        if not st.session_state.get("systems_in_scope"):
            missing.append("at least one system in scope")
        if not st.session_state.get("selected_kpis"):
            missing.append("at least one KPI")
        if not project_scale:
            missing.append("project scale")
        if not country:
            missing.append("country")

        if missing:
            st.warning("Please select: " + ", ".join(missing) + " before proceeding.")
        else:
            # ── Translate to legacy keys ──
            legacy = translate_to_legacy_keys(
                project_type,
                st.session_state.get("systems_in_scope", []),
                st.session_state.get("selected_kpis", []),
            )
            st.session_state["analysis_type"] = legacy["analysis_type"]
            st.session_state["analysis_focus"] = legacy["analysis_focus"]
            st.session_state["energy_system_focus"] = legacy["energy_system_focus"]
            st.session_state["renewable_types"] = legacy["renewable_types"]
            st.session_state["urban_design_types"] = legacy["urban_design_types"]
            st.session_state["climate_resilience_types"] = legacy["climate_resilience_types"]

            # Mark pipeline mode
            st.session_state["pipeline_mode"] = "step1plus"

            st.switch_page("pages/2_Review_Data.py")

with col3:
    st.markdown(
        "<div style='text-align: right; color: #94a3b8; font-size: 0.85rem; "
        "padding-top: 0.5rem;'>Step 1+ of 6</div>",
        unsafe_allow_html=True,
    )
