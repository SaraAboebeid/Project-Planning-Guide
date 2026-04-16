"""
Page 0: Define Project  (Step 1+)

Alternative, project-intent-driven scoping page.
Selects project type → systems in scope → KPIs → scale → context,
then translates into the session-state keys Steps 2-6 expect.
"""

import streamlit as st
import pydeck as pdk
import folium
from folium.plugins import Draw
from streamlit_folium import st_folium
from config.project_types import (
    PROJECT_TYPES,
    PROJECT_TYPE_DESCRIPTIONS,
    SYSTEMS_BY_PROJECT_TYPE,
    DISABLED_SYSTEMS,
    FOLLOW_UP_SYSTEMS,
    EC_FOLLOW_UP_QUESTIONS,
    EC_FOCUS_OPTIONS,
    KPIS_BY_PROJECT_TYPE,
    CONDITIONAL_KPIS,
    EXPLORATION_OPTIONS,
    EXPLORATION_CONSTRAINTS,
    translate_to_legacy_keys,
)

_APPROACH_NAMES = list(EXPLORATION_OPTIONS)
from utils.shared_css import inject_shared_css, render_step_indicator, render_branded_top_bar
from utils.location_data import (
    geocode_address,
    get_nearby_epc_snapshot,
    get_epc_snapshot_for_bbox,
    has_location_database,
)

st.set_page_config(page_title="Define Project", layout="wide")

# Inject shared MD3 button / theme CSS
inject_shared_css()

# Hide the sidebar pages navigation
st.markdown("""
<style>
    [data-testid="stSidebarNav"] {display: none;}
    section[data-testid="stSidebar"] {display: none;}

    /* Page-level polish for Step 1+ */
    .stApp {
        background: #f8fafc !important;
    }
    .block-container {
        max-width: 900px;
        padding: 1rem 2rem 3rem 2rem;
    }

    /* Section labels */
    .section-label {
        font-family: 'Inter', -apple-system, sans-serif;
        font-size: 0.98rem;
        font-weight: 700;
        color: #0f172a;
        margin-bottom: 0.25rem;
        letter-spacing: -0.005em;
    }
    .section-label span { color: #dc2626; }

    /* Refined dividers */
    .section-divider {
        margin: 1rem 0 1.2rem 0;
        border: none;
        border-top: 1px solid #e2e8f0;
    }

    /* Subtle card wrapper for form groups */
    .form-section {
        background: #ffffff;
        border: 1px solid #e2e8f0;
        border-radius: 16px;
        padding: 1.4rem 1.5rem;
        margin-bottom: 1.2rem;
        box-shadow: 0 1px 4px rgba(0,0,0,0.03);
        transition: border-color 0.2s ease;
    }
    .form-section:hover {
        border-color: rgba(51,169,160,0.2);
    }
</style>
""", unsafe_allow_html=True)

# Branded top bar + persistent step progress indicator
render_branded_top_bar(
    "Step 1+: Define Project",
    "Select your project type, systems in scope, KPIs, and project context using the Chalmers decision-support workflow.",
)
render_step_indicator(1)

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
            if key.startswith("p1p_"):
                del st.session_state[key]
        for key in ["systems_in_scope", "exploration_approaches",
                    "selected_kpis"]:
            st.session_state.pop(key, None)
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
    _scope_label = "Entities in Scope" if project_type == "Energy Community Planning" else "Systems in Scope"
    st.markdown(
        f"<div style='font-size:1.02rem; font-weight:600; margin-bottom:0.2rem;'>"
        f"{_scope_label} <span style='color:#dc2626'>*</span></div>",
        unsafe_allow_html=True,
    )

    all_systems = SYSTEMS_BY_PROJECT_TYPE.get(project_type, [])
    disabled_list = DISABLED_SYSTEMS.get(project_type, [])
    selectable_systems = [s for s in all_systems if s not in disabled_list]

    # Filter saved defaults to only include currently selectable options
    # (follow-up systems like "Battery System" are added separately)
    _saved = st.session_state.get("systems_in_scope", [])
    _safe_defaults = [s for s in _saved if s in selectable_systems]

    selected_systems = st.multiselect(
        _scope_label,
        options=selectable_systems,
        default=_safe_defaults,
        placeholder="Choose systems...",
        key="p1p_systems_select",
        label_visibility="collapsed",
    )
    st.session_state["systems_in_scope"] = selected_systems

    # Show greyed-out unavailable systems as a note
    if disabled_list:
        disabled_str = ", ".join(disabled_list)
        st.caption(
            f"🔒 Coming soon: {disabled_str}"
        )

    # ── Follow-up questions (e.g. battery for PV systems) ────────────
    _followups = FOLLOW_UP_SYSTEMS.get(project_type, {})
    _followup_added = []
    for _fu_system, _fu_cfg in _followups.items():
        _triggers = _fu_cfg["triggers"]
        if any(t in selected_systems for t in _triggers):
            _fu_key = f"p1p_followup_{_fu_system.replace(' ', '_').lower()}"
            _answer = st.radio(
                _fu_cfg["question"],
                options=["Yes", "No"],
                index=0 if st.session_state.get(_fu_key, "No") == "Yes" else 1,
                horizontal=True,
                key=_fu_key,
                help=_fu_cfg.get("help", ""),
            )
            if _answer == "Yes":
                _followup_added.append(_fu_system)

    # Merge follow-up systems into selected_systems
    for _fu in _followup_added:
        if _fu not in selected_systems:
            selected_systems.append(_fu)
    st.session_state["systems_in_scope"] = selected_systems

    # ── RE: electricity threshold follow-up ────────────────────────
    if project_type == "Renewable Energy Planning":
        _pv_systems = {"Rooftop PV", "Community PV", "Facade PV (BIPV)"}
        if _pv_systems & set(selected_systems):
            _threshold_key = "p1p_re_electricity_threshold"
            _saved_threshold = st.session_state.get(_threshold_key, "Partial coverage")
            _threshold_options = ["Net zero", "Surplus", "Partial coverage"]
            _threshold = st.selectbox(
                "What is your electricity target?",
                options=_threshold_options,
                index=_threshold_options.index(_saved_threshold)
                    if _saved_threshold in _threshold_options else 2,
                key=_threshold_key,
                help=(
                    "Net zero — PV covers 100 % of annual demand. "
                    "Surplus — PV exceeds demand (export to grid). "
                    "Partial coverage — PV covers a share of demand."
                ),
            )
            st.session_state["re_electricity_threshold"] = _threshold

    # ── Renovation Planning follow-up questions ────────────────────
    if project_type == "Renovation Planning" and selected_systems:

        # --- Building Envelope sub-components ---
        if "Building Envelope (Windows, Roof, Walls, Floors)" in selected_systems:
            st.markdown(
                "<hr style='margin: 0.5rem 0 0.8rem 0; border: none; "
                "border-top: 1px solid #e2e8f0;'>",
                unsafe_allow_html=True,
            )
            st.markdown(
                "<div style='font-size:0.95rem; font-weight:600; "
                "margin-bottom:0.2rem;'>"
                "Which components are included in the renovation? "
                "<span style='color:#dc2626'>*</span></div>",
                unsafe_allow_html=True,
            )
            st.caption("Select one or more components:")
            envelope_options = [
                "Walls", "Windows", "Doors",
                "Structure (Columns & Beams)",
                "Floor", "Roof", "Balcony", "Insulation",
            ]
            env_cols = st.columns(2)
            selected_envelope = []
            for i, env in enumerate(envelope_options):
                env_key = f"p1p_renv_{env.lower().replace(' ', '_').replace('(', '').replace(')', '').replace('&', 'and')}"
                with env_cols[i % 2]:
                    if st.checkbox(env, key=env_key):
                        selected_envelope.append(env)
            st.session_state["renovation_envelope_components"] = selected_envelope
        else:
            st.session_state["renovation_envelope_components"] = []

        # --- Heating System: existing system question ---
        if "Heating System" in selected_systems:
            st.markdown(
                "<hr style='margin: 0.5rem 0 0.8rem 0; border: none; "
                "border-top: 1px solid #e2e8f0;'>",
                unsafe_allow_html=True,
            )
            st.markdown(
                "<div style='font-size:0.95rem; font-weight:600; "
                "margin-bottom:0.2rem;'>"
                "Is there an existing heating system installed?</div>",
                unsafe_allow_html=True,
            )
            _heat_idx = 0 if st.session_state.get("p1p_existing_heating", "Yes") == "Yes" else 1
            existing_heating = st.radio(
                "Existing heating system?",
                options=["Yes", "No"],
                horizontal=True,
                index=_heat_idx,
                key="p1p_existing_heating",
                label_visibility="collapsed",
            )
            st.session_state["renovation_existing_heating"] = existing_heating

        # --- Cooling System: existing system question ---
        if "Cooling System" in selected_systems:
            st.markdown(
                "<hr style='margin: 0.5rem 0 0.8rem 0; border: none; "
                "border-top: 1px solid #e2e8f0;'>",
                unsafe_allow_html=True,
            )
            st.markdown(
                "<div style='font-size:0.95rem; font-weight:600; "
                "margin-bottom:0.2rem;'>"
                "Is there an existing cooling system installed?</div>",
                unsafe_allow_html=True,
            )
            _cool_idx = 0 if st.session_state.get("p1p_existing_cooling", "Yes") == "Yes" else 1
            existing_cooling = st.radio(
                "Existing cooling system?",
                options=["Yes", "No"],
                horizontal=True,
                index=_cool_idx,
                key="p1p_existing_cooling",
                label_visibility="collapsed",
            )
            st.session_state["renovation_existing_cooling"] = existing_cooling

        # --- DHW: existing system question ---
        if "Domestic Hot Water System (DHW)" in selected_systems:
            st.markdown(
                "<hr style='margin: 0.5rem 0 0.8rem 0; border: none; "
                "border-top: 1px solid #e2e8f0;'>",
                unsafe_allow_html=True,
            )
            st.markdown(
                "<div style='font-size:0.95rem; font-weight:600; "
                "margin-bottom:0.2rem;'>"
                "Is there an existing domestic hot water system?</div>",
                unsafe_allow_html=True,
            )
            _dhw_idx = 0 if st.session_state.get("p1p_existing_dhw", "Yes") == "Yes" else 1
            existing_dhw = st.radio(
                "Existing DHW system?",
                options=["Yes", "No"],
                horizontal=True,
                index=_dhw_idx,
                key="p1p_existing_dhw",
                label_visibility="collapsed",
            )
            st.session_state["renovation_existing_dhw"] = existing_dhw

    # ── EC-specific follow-ups (existing PV / battery on site) ─────
    if project_type == "Energy Community Planning" and selected_systems:
        _ec_pv_systems = {"Rooftop PV", "Community PV", "Facade PV (BIPV)"}
        _ec_has_pv = _ec_pv_systems & set(selected_systems)
        if _ec_has_pv:
            _ans_pv = st.radio(
                EC_FOLLOW_UP_QUESTIONS["existing_pv"]["question"],
                options=["Yes", "No"],
                index=0 if st.session_state.get("p1p_ec_existing_pv", "No") == "Yes" else 1,
                horizontal=True,
                key="p1p_ec_existing_pv",
                help=EC_FOLLOW_UP_QUESTIONS["existing_pv"]["help"],
            )
            st.session_state["ec_existing_pv"] = (_ans_pv == "Yes")
        else:
            st.session_state["ec_existing_pv"] = False

        if "Battery System" in selected_systems:
            _ans_bat = st.radio(
                EC_FOLLOW_UP_QUESTIONS["existing_battery"]["question"],
                options=["Yes", "No"],
                index=0 if st.session_state.get("p1p_ec_existing_battery", "No") == "Yes" else 1,
                horizontal=True,
                key="p1p_ec_existing_battery",
                help=EC_FOLLOW_UP_QUESTIONS["existing_battery"]["help"],
            )
            st.session_state["ec_existing_battery"] = (_ans_bat == "Yes")
        else:
            st.session_state["ec_existing_battery"] = False

    # ── EC energy focus (Electricity / Heating / Cooling / All) ────
    if project_type == "Energy Community Planning":
        st.markdown(
            "<hr style='margin: 0.8rem 0 1rem 0; border: none; "
            "border-top: 1px solid #e2e8f0;'>",
            unsafe_allow_html=True,
        )
        st.markdown(
            "<div style='font-size:1.02rem; font-weight:600; margin-bottom:0.2rem;'>"
            "Energy System in Scope <span style='color:#dc2626'>*</span></div>",
            unsafe_allow_html=True,
        )
        _cur_focus = st.session_state.get("ec_energy_focus", [])
        _ec_focus = st.multiselect(
            "Energy focus",
            options=EC_FOCUS_OPTIONS,
            default=[f for f in _cur_focus if f in EC_FOCUS_OPTIONS],
            placeholder="Choose focus...",
            key="p1p_ec_focus_select",
            label_visibility="collapsed",
        )
        st.session_state["ec_energy_focus"] = _ec_focus

# ============================================================================
# EXPLORATION APPROACH
# ============================================================================

if project_type:
    st.markdown(
        "<hr style='margin: 0.8rem 0 1rem 0; border: none; "
        "border-top: 1px solid #e2e8f0;'>",
        unsafe_allow_html=True,
    )
    st.markdown(
        "<div style='font-size:1.02rem; font-weight:600; margin-bottom:0.2rem;'>"
        "How would you like to explore this? "
        "<span style='color:#dc2626'>*</span></div>",
        unsafe_allow_html=True,
    )

    selected_explorations = st.multiselect(
        "Exploration approaches",
        options=_APPROACH_NAMES,
        default=st.session_state.get("exploration_approaches", []),
        placeholder="Choose approaches...",
        key="p1p_exploration_select",
        label_visibility="collapsed",
    )
    st.session_state["exploration_approaches"] = selected_explorations

    # Show brief descriptions for selected approaches
    if selected_explorations:
        for appr in selected_explorations:
            cfg = EXPLORATION_CONSTRAINTS.get(appr, {})
            st.caption(
                f"**{appr}** — {cfg.get('description', '')}"
            )

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

    # Build available KPI list: base + conditional
    _base_kpis = list(KPIS_BY_PROJECT_TYPE.get(project_type, []))
    _conditional = CONDITIONAL_KPIS.get(project_type, {})
    _systems_set = set(st.session_state.get("systems_in_scope", []))
    for _trigger, _extras in _conditional.items():
        if _trigger in _systems_set:
            for _k in _extras:
                if _k not in _base_kpis:
                    _base_kpis.append(_k)

    # Clean stale defaults that are no longer in the available list
    _prev = st.session_state.get("selected_kpis", [])
    _valid_prev = [k for k in _prev if k in _base_kpis]
    if _valid_prev != _prev:
        st.session_state["selected_kpis"] = _valid_prev

    selected_kpis = st.multiselect(
        "Key Performance Indicators",
        options=_base_kpis,
        default=st.session_state.get("selected_kpis", []),
        placeholder="Choose KPIs...",
        key="p1p_kpis_select",
        label_visibility="collapsed",
    )
    st.session_state["selected_kpis"] = selected_kpis

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

if project_type == "Energy Community Planning":
    scale_options = ["Neighborhood", "City"]
    if st.session_state.get("project_scale") == "Building":
        st.session_state["project_scale"] = None
else:
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
    help=(
        "Energy Community Planning is available at Neighborhood or City scale"
        if project_type == "Energy Community Planning"
        else "Select the geographic scope of your project"
    ),
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
    "Country <span style='color:#dc2626'>*</span></div>",
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
    st.markdown("<div style='height:1px;'></div>", unsafe_allow_html=True)

# ============================================================================
# PROJECT LOCATION MAP + DATA SNAPSHOT
# ============================================================================

st.markdown(
    "<hr style='margin: 0.8rem 0 1rem 0; border: none; border-top: 1px solid #e2e8f0;'>",
    unsafe_allow_html=True,
)
st.markdown(
    "<div style='font-size:1.02rem; font-weight:600; margin-bottom:0.2rem;'>"
    "Project Location Map</div>",
    unsafe_allow_html=True,
)

if not has_location_database():
    st.info("Location dataset not found: data/sensitivity/epc_sweden.duckdb")
else:
    st.caption("Select data area by address + radius, or draw a bounding box directly on the map.")

    is_building_scale = (project_scale == "Building")
    if is_building_scale:
        selection_mode = "Address + Radius"
        st.session_state["p1p_location_mode"] = selection_mode
        st.caption("Building scale uses a single address (nearest building). Radius and bounding box are disabled.")
    else:
        selection_mode = st.radio(
            "Selection mode",
            options=["Address + Radius", "Draw Bounding Box"],
            horizontal=True,
            key="p1p_location_mode",
        )

    if selection_mode == "Address + Radius":
        col_map_a, col_map_b, col_map_c = st.columns([2, 1, 1])
        with col_map_a:
            location_query = st.text_input(
                "Project address",
                value=st.session_state.get("location", ""),
                placeholder="Example: Johanneberg, Gothenburg",
                key="p1p_project_location_query",
            )
            # Keep the canonical location field in sync with what the user types,
            # so Step 2+ can transition smoothly even before pressing Locate.
            st.session_state["location"] = location_query
        with col_map_b:
            if is_building_scale:
                st.markdown("<div style='height:1.2rem;'></div>", unsafe_allow_html=True)
                st.markdown("<div style='font-size:0.85rem;color:#64748b;'>Single building mode</div>", unsafe_allow_html=True)
                st.session_state["location_radius_m"] = 80
            else:
                radius_m = st.slider(
                    "Search radius (m)",
                    min_value=300,
                    max_value=3000,
                    step=100,
                    value=int(st.session_state.get("location_radius_m", 800)),
                    key="p1p_location_radius_m",
                )
                st.session_state["location_radius_m"] = radius_m
        with col_map_c:
            st.markdown("<div style='height:1.65rem;'></div>", unsafe_allow_html=True)
            locate_clicked = st.button("Locate & Load Data", use_container_width=True, key="p1p_locate_project_btn")

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
                        st.session_state["location_selection"] = {
                            "mode": "address",
                            "query": location_query,
                            "label": geocoded["display_name"],
                            "lat": float(geocoded["lat"]),
                            "lon": float(geocoded["lon"]),
                            "radius_m": 80 if is_building_scale else int(st.session_state.get("location_radius_m", 800)),
                        }
                except Exception as exc:
                    st.error(f"Could not geocode this address: {exc}")

        if "project_lat" in st.session_state and "project_lon" in st.session_state:
            lat = float(st.session_state["project_lat"])
            lon = float(st.session_state["project_lon"])
            if st.session_state.get("location_selection", {}).get("mode") != "address":
                st.session_state["location_selection"] = {
                    "mode": "address",
                    "query": st.session_state.get("location", ""),
                    "label": st.session_state.get("project_location_label", "Selected location"),
                    "lat": lat,
                    "lon": lon,
                    "radius_m": 80 if is_building_scale else int(st.session_state.get("location_radius_m", 800)),
                }
            st.markdown(
                f"<div style='font-size:0.9rem; color:#475569; margin-top:0.4rem;'><b>Selected location:</b> "
                f"{st.session_state.get('project_location_label', 'Selected location')}</div>",
                unsafe_allow_html=True,
            )
            project_point = [{"lat": lat, "lon": lon, "kind": "Project location"}]

            st.pydeck_chart(
                pdk.Deck(
                    map_style="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
                    initial_view_state=pdk.ViewState(latitude=lat, longitude=lon, zoom=14, pitch=42),
                    layers=[
                        pdk.Layer(
                            "ScatterplotLayer",
                            data=project_point,
                            get_position="[lon, lat]",
                            get_radius=40,
                            get_fill_color=[196, 232, 29, 200],
                            pickable=True,
                        ),
                    ],
                    tooltip={"text": "{kind}"},
                ),
                use_container_width=True,
            )
            if is_building_scale:
                st.caption("Single building address selected. The nearest building footprint and data are shown in Step 2+.")
            else:
                st.caption("Project marker shown here. Footprints and local EPC preview are shown in Step 2+.")

    else:
        st.caption("Draw a rectangle and use its extent as the project area.")
        default_lat = float(st.session_state.get("project_lat", 57.7089))
        default_lon = float(st.session_state.get("project_lon", 11.9746))

        draw_map = folium.Map(location=[default_lat, default_lon], zoom_start=12, tiles="CartoDB positron")
        Draw(
            export=False,
            draw_options={
                "polyline": False,
                "polygon": False,
                "circle": False,
                "marker": False,
                "circlemarker": False,
                "rectangle": True,
            },
            edit_options={"edit": False, "remove": True},
        ).add_to(draw_map)

        draw_result = st_folium(draw_map, width=None, height=420, key="p1p_bbox_draw_map")

        last_geom = (draw_result or {}).get("last_active_drawing")
        if not last_geom:
            all_drawings = (draw_result or {}).get("all_drawings") or []
            if all_drawings:
                last_geom = all_drawings[-1]
        if last_geom and last_geom.get("geometry", {}).get("type") == "Polygon":
            coords = last_geom["geometry"]["coordinates"][0]
            lons = [c[0] for c in coords]
            lats = [c[1] for c in coords]
            if lats and lons:
                bbox = {
                    "min_lat": min(lats),
                    "max_lat": max(lats),
                    "min_lon": min(lons),
                    "max_lon": max(lons),
                }
                st.session_state["project_bbox"] = bbox
                st.session_state["location_selection"] = {
                    "mode": "bbox",
                    "bbox": {
                        "min_lat": float(bbox["min_lat"]),
                        "max_lat": float(bbox["max_lat"]),
                        "min_lon": float(bbox["min_lon"]),
                        "max_lon": float(bbox["max_lon"]),
                    },
                }

        if st.session_state.get("project_bbox"):
            b = st.session_state["project_bbox"]
            st.caption(
                f"Using bounding box: lat [{b['min_lat']:.5f}, {b['max_lat']:.5f}] · "
                f"lon [{b['min_lon']:.5f}, {b['max_lon']:.5f}]"
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
        if not st.session_state.get("exploration_approaches"):
            missing.append("at least one exploration approach")
        if not st.session_state.get("selected_kpis"):
            missing.append("at least one KPI")
        if not project_scale:
            missing.append("project scale")
        if not country:
            missing.append("country")
        if project_type == "Energy Community Planning" and not st.session_state.get("ec_energy_focus", []):
            missing.append("energy focus")

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

            st.switch_page("pages/2plus_Review_Data.py")

with col3:
    st.markdown(
        "<div style='text-align: right; color: #94a3b8; font-size: 0.85rem; "
        "padding-top: 0.5rem;'>Step 1+ of 6</div>",
        unsafe_allow_html=True,
    )
