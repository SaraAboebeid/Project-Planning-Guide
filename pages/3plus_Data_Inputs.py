"""
Page 3+: Missing Data & Assumptions  (Renovation Planning pipeline)

Gap analysis from Step 2+ (EPC + TABULA), user input forms for renovation
component quantities and U-values, and confidence sliders for assumptions.
"""

import streamlit as st
import pandas as pd
from utils.shared_css import inject_shared_css, render_step_indicator, render_branded_top_bar, render_top_cards
from utils.tabula_matching import (
    match_archetype,
    get_tabula_energy_for_zone,
    BUILDING_TYPE_LABELS,
)

st.set_page_config(page_title="Missing Data & Assumptions (Step 3+)", layout="wide")
inject_shared_css()

# Hide the sidebar
st.markdown("""
<style>
    [data-testid="stSidebarNav"] {display: none;}
    section[data-testid="stSidebar"] {display: none;}
</style>
""", unsafe_allow_html=True)

# ============================================================================
# PREREQUISITES
# ============================================================================

project_type = st.session_state.get("project_type")
if not project_type or st.session_state.get("pipeline_mode") != "step1plus":
    st.warning("Please complete Step 1+ and Step 2+ first.")
    if st.button("Go to Step 1+"):
        st.switch_page("pages/0_Define_Project.py")
    st.stop()

if project_type != "Renovation Planning":
    st.warning("Step 3+ is for Renovation Planning only.")
    if st.button("Back to Step 2+"):
        st.switch_page("pages/2plus_Review_Data.py")
    st.stop()

# ============================================================================
# HEADER
# ============================================================================

render_branded_top_bar(
    "Step 3+: Missing Data & Assumptions",
    "Identify data gaps, provide renovation component details, and set assumptions for the analysis.",
)
render_step_indicator(3)

# ============================================================================
# GATHER DATA FROM PREVIOUS STEPS
# ============================================================================

reno_envelope = st.session_state.get("renovation_envelope_components", [])
tabula_archetype = st.session_state.get("tabula_archetype")
tabula_conf = st.session_state.get("tabula_confidence")
tabula_zone = st.session_state.get("tabula_climate_zone", 3)
epc_tabula_delta = st.session_state.get("epc_tabula_delta")
systems = st.session_state.get("systems_in_scope", [])
selected_kpis = st.session_state.get("selected_kpis", [])

# ============================================================================
# TOP CARDS — status summary
# ============================================================================

_n_components = len(reno_envelope)
_has_tabula = tabula_archetype is not None
_has_delta = epc_tabula_delta is not None
_gaps = 0

# Count what's missing
_gap_items = []
if not _has_tabula:
    _gap_items.append("No TABULA archetype match")
    _gaps += 1
if not _has_delta:
    _gap_items.append("No EPC ↔ TABULA energy comparison")
    _gaps += 1
if not reno_envelope:
    _gap_items.append("No renovation components selected")
    _gaps += 1

render_top_cards([
    {
        "value": str(_n_components),
        "label": "Renovation Components",
        "color": "#33A9A0",
        "bg": "rgba(51,169,160,0.10)",
        "border": "rgba(51,169,160,0.25)",
    },
    {
        "value": "✓" if _has_tabula else "—",
        "label": "TABULA Match",
        "color": "#8AB62E" if _has_tabula else "#94a3b8",
        "bg": "rgba(138,182,46,0.10)" if _has_tabula else "#f1f5f9",
        "border": "rgba(138,182,46,0.25)" if _has_tabula else "#e2e8f0",
    },
    {
        "value": str(_gaps),
        "label": "Data Gaps",
        "color": "#FF6B6B" if _gaps > 0 else "#33A9A0",
        "bg": "rgba(255,107,107,0.10)" if _gaps > 0 else "rgba(51,169,160,0.10)",
        "border": "rgba(255,107,107,0.25)" if _gaps > 0 else "rgba(51,169,160,0.25)",
    },
])

# ============================================================================
# SECTION 1: GAP ANALYSIS
# ============================================================================

st.markdown(
    "<div style='font-size:1.08rem; font-weight:700; color:#334155; "
    "margin:0.5rem 0 0.4rem;'>📋 Data Gap Analysis</div>",
    unsafe_allow_html=True,
)
st.caption(
    "Overview of what data is available from Step 2+ (EPC + TABULA) and "
    "what still needs to be provided or assumed."
)

if _gap_items:
    for _g in _gap_items:
        st.markdown(
            f"<div style='background:rgba(255,107,107,0.06); border:1px solid rgba(255,107,107,0.2); "
            f"border-radius:10px; padding:0.6rem 0.9rem; margin-bottom:0.4rem; "
            f"display:flex; align-items:center; gap:0.5rem;'>"
            f"<span style='font-size:0.9rem;'>⚠️</span>"
            f"<span style='font-size:0.88rem; color:#1e293b; font-weight:500;'>{_g}</span>"
            f"</div>",
            unsafe_allow_html=True,
        )
else:
    st.success("All key data points are available from Step 2+. You can refine assumptions below.")

# Show what IS available
_available = []
if _has_tabula:
    _available.append(f"TABULA archetype: **{tabula_archetype['code']}** ({tabula_archetype['type_label']}, {tabula_archetype['period']})")
if _has_delta:
    _available.append(f"EPC ↔ TABULA delta: **{epc_tabula_delta['delta_pct']:+.1f}%** ({epc_tabula_delta['interpretation']})")
if reno_envelope:
    _available.append(f"Renovation components: **{', '.join(reno_envelope)}**")

if _available:
    with st.expander("✅ Available from Step 2+", expanded=False):
        for _a in _available:
            st.markdown(f"- {_a}")

# ============================================================================
# SECTION 2: RENOVATION COMPONENT DETAILS
# ============================================================================

st.markdown(
    "<hr style='margin:1rem 0; border:none; border-top:1px solid #e2e8f0;'>",
    unsafe_allow_html=True,
)
st.markdown(
    "<div style='font-size:1.08rem; font-weight:700; color:#334155; "
    "margin:0.5rem 0 0.4rem;'>🔧 Renovation Component Details</div>",
    unsafe_allow_html=True,
)
st.caption(
    "Provide quantities and target U-values for each renovation component. "
    "TABULA defaults are pre-filled where available."
)

if not reno_envelope:
    st.info(
        "No renovation components were selected in Step 1+. "
        "Go back to add envelope components for the renovation."
    )
else:
    # Initialize component details in session state
    if "renovation_component_details" not in st.session_state:
        st.session_state["renovation_component_details"] = {}

    _comp_details = st.session_state["renovation_component_details"]
    _tabula_u = tabula_archetype.get("u_values", {}) if tabula_archetype else {}
    _tabula_areas = tabula_archetype.get("areas_m2", {}) if tabula_archetype else {}

    # Map component names to TABULA field names
    _comp_to_tabula_u = {
        "Walls": "wall",
        "Windows": "window",
        "Doors": "door",
        "Roof": "roof",
        "Floor": "floor",
        "Insulation": "wall",  # Use wall U-value as proxy for insulation
    }
    _comp_to_tabula_area = {
        "Walls": "wall",
        "Windows": "window",
        "Doors": "door",
        "Roof": "roof",
        "Floor": "floor",
        "Balcony": None,
        "Structure": None,
        "Insulation": None,
    }

    _comp_tabs = st.tabs([f"📦 {c}" for c in reno_envelope])
    for _tab, _comp in zip(_comp_tabs, reno_envelope):
        with _tab:
            _existing_u_key = _comp_to_tabula_u.get(_comp, "")
            _existing_u = _tabula_u.get(_existing_u_key) if _existing_u_key else None
            _area_key = _comp_to_tabula_area.get(_comp, "")
            _existing_area = _tabula_areas.get(_area_key) if _area_key else None

            c1, c2 = st.columns(2)
            with c1:
                _area_default = float(_existing_area) if _existing_area else 0.0
                _area = st.number_input(
                    f"Area (m²)",
                    min_value=0.0,
                    max_value=10000.0,
                    value=_area_default,
                    step=1.0,
                    key=f"s3p_area_{_comp}",
                    help=f"TABULA default: {_area_default:.0f} m²" if _existing_area else "No TABULA data",
                )

                if _existing_u is not None and _existing_u > 0:
                    _u_existing = st.number_input(
                        f"Existing U-value (W/m²K)",
                        min_value=0.0,
                        max_value=10.0,
                        value=float(_existing_u),
                        step=0.01,
                        format="%.2f",
                        key=f"s3p_u_existing_{_comp}",
                        help=f"From TABULA archetype ({tabula_archetype['period'] if tabula_archetype else ''})",
                    )
                else:
                    _u_existing = st.number_input(
                        f"Existing U-value (W/m²K)",
                        min_value=0.0,
                        max_value=10.0,
                        value=0.0,
                        step=0.01,
                        format="%.2f",
                        key=f"s3p_u_existing_{_comp}",
                        help="No TABULA data available — enter manually",
                    )

            with c2:
                # Target U-value for renovation
                _target_defaults = {
                    "Walls": 0.18, "Windows": 1.2, "Doors": 1.2,
                    "Roof": 0.13, "Floor": 0.15, "Insulation": 0.15,
                    "Structure": 0.0, "Balcony": 0.0,
                }
                _target_default = _target_defaults.get(_comp, 0.0)
                _u_target = st.number_input(
                    f"Target U-value (W/m²K)",
                    min_value=0.0,
                    max_value=10.0,
                    value=_target_default,
                    step=0.01,
                    format="%.2f",
                    key=f"s3p_u_target_{_comp}",
                    help="Target U-value after renovation (BBR recommended values pre-filled)",
                )

                _confidence = st.slider(
                    "Data confidence",
                    min_value=0,
                    max_value=100,
                    value=80 if _existing_area else 50,
                    step=5,
                    key=f"s3p_confidence_{_comp}",
                    help="How confident are you in these values? 100% = measured data, 50% = rough estimate",
                )

            # Store details
            _comp_details[_comp] = {
                "area_m2": _area,
                "u_existing": _u_existing,
                "u_target": _u_target,
                "confidence": _confidence,
                "tabula_source": _existing_u is not None,
            }

            # Show improvement potential
            if _u_existing > 0 and _u_target > 0 and _u_existing > _u_target:
                _improvement = (_u_existing - _u_target) / _u_existing * 100
                st.markdown(
                    f"<div style='background:rgba(138,182,46,0.08); border:1px solid rgba(138,182,46,0.2); "
                    f"border-radius:10px; padding:0.5rem 0.8rem; margin-top:0.3rem;'>"
                    f"<span style='font-size:0.85rem; color:#597001; font-weight:600;'>"
                    f"📉 U-value improvement: {_improvement:.0f}% "
                    f"({_u_existing:.2f} → {_u_target:.2f} W/m²K)</span></div>",
                    unsafe_allow_html=True,
                )

    st.session_state["renovation_component_details"] = _comp_details

# ============================================================================
# SECTION 3: ADDITIONAL ASSUMPTIONS
# ============================================================================

st.markdown(
    "<hr style='margin:1rem 0; border:none; border-top:1px solid #e2e8f0;'>",
    unsafe_allow_html=True,
)
st.markdown(
    "<div style='font-size:1.08rem; font-weight:700; color:#334155; "
    "margin:0.5rem 0 0.4rem;'>⚙️ Additional Assumptions</div>",
    unsafe_allow_html=True,
)
st.caption(
    "Set building-level parameters that affect energy modelling and material choices."
)

a1, a2, a3 = st.columns(3)

with a1:
    _lifespan = st.number_input(
        "Building lifespan (years)",
        min_value=10,
        max_value=100,
        value=50,
        step=5,
        key="s3p_lifespan",
        help="Reference study period for LCA calculations",
    )
    _heated_area = st.number_input(
        "Heated area — Atemp (m²)",
        min_value=10.0,
        max_value=100000.0,
        value=float(
            st.session_state.get("s2p_atemp")
            or (tabula_archetype.get("areas_m2", {}).get("floor", 0) * 2 if tabula_archetype else 0)
            or 150.0
        ),
        step=10.0,
        key="s3p_atemp",
        help="Total heated floor area",
    )

with a2:
    _climate_zone_sel = st.selectbox(
        "Climate zone for analysis",
        options=[1, 2, 3],
        index=[1, 2, 3].index(tabula_zone),
        key="s3p_climate_zone",
        help="Zone 1 = North, Zone 2 = Central, Zone 3 = South Sweden",
    )
    _infiltration = st.selectbox(
        "Air tightness level",
        options=["Poor (>3 ACH50)", "Average (1-3 ACH50)", "Good (<1 ACH50)"],
        index=1,
        key="s3p_infiltration",
        help="Estimated building air tightness at 50 Pa",
    )

with a3:
    _heating_system = st.selectbox(
        "Primary heating system",
        options=[
            "District heating",
            "Heat pump (air-source)",
            "Heat pump (ground-source)",
            "Electric resistance",
            "Gas boiler",
            "Oil boiler",
            "Pellet/wood boiler",
            "Other",
        ],
        index=0,
        key="s3p_heating_system",
    )
    _has_ventilation_hr = st.selectbox(
        "Ventilation heat recovery",
        options=["None", "Partial (<60% efficiency)", "Good (60-80%)", "Excellent (>80%)"],
        index=0,
        key="s3p_vent_hr",
    )

st.session_state["renovation_assumptions"] = {
    "lifespan_years": _lifespan,
    "atemp_m2": _heated_area,
    "climate_zone": _climate_zone_sel,
    "infiltration": _infiltration,
    "heating_system": _heating_system,
    "ventilation_hr": _has_ventilation_hr,
}

# ============================================================================
# SECTION 4: READINESS SUMMARY
# ============================================================================

st.markdown(
    "<hr style='margin:1rem 0; border:none; border-top:1px solid #e2e8f0;'>",
    unsafe_allow_html=True,
)
st.markdown(
    "<div style='font-size:1.08rem; font-weight:700; color:#334155; "
    "margin:0.5rem 0 0.4rem;'>✅ Readiness Summary</div>",
    unsafe_allow_html=True,
)

_ready_items = []
_not_ready = []

# Check component details
if reno_envelope and _comp_details:
    _filled = sum(1 for c in reno_envelope if _comp_details.get(c, {}).get("area_m2", 0) > 0)
    if _filled == len(reno_envelope):
        _ready_items.append(f"All {_filled} components have area data")
    else:
        _not_ready.append(f"{len(reno_envelope) - _filled} component(s) missing area")

if _has_tabula:
    _ready_items.append(f"TABULA archetype matched: {tabula_archetype['code']}")
else:
    _not_ready.append("No TABULA archetype — U-values must be entered manually")

if _has_delta:
    _ready_items.append(f"EPC ↔ TABULA comparison available (Δ{epc_tabula_delta['delta_pct']:+.1f}%)")

_ready_items.append(f"Climate zone: {_climate_zone_sel}")
_ready_items.append(f"Heating system: {_heating_system}")
_ready_items.append(f"Building lifespan: {_lifespan} years")

for _r in _ready_items:
    st.markdown(
        f"<div style='display:flex; align-items:center; gap:0.5rem; padding:0.35rem 0;'>"
        f"<span style='color:#33A9A0; font-size:0.9rem;'>✓</span>"
        f"<span style='font-size:0.88rem; color:#1e293b;'>{_r}</span></div>",
        unsafe_allow_html=True,
    )

for _nr in _not_ready:
    st.markdown(
        f"<div style='display:flex; align-items:center; gap:0.5rem; padding:0.35rem 0;'>"
        f"<span style='color:#F59E0B; font-size:0.9rem;'>⚠</span>"
        f"<span style='font-size:0.88rem; color:#1e293b;'>{_nr}</span></div>",
        unsafe_allow_html=True,
    )

# Average confidence
if _comp_details:
    _avg_conf = sum(c.get("confidence", 50) for c in _comp_details.values()) / len(_comp_details)
    _conf_color = "#33A9A0" if _avg_conf >= 70 else "#33528A" if _avg_conf >= 50 else "#F59E0B"
    st.markdown(
        f"<div style='margin-top:0.6rem; background:rgba(51,82,138,0.06); "
        f"border-radius:12px; padding:0.8rem 1rem; border-left:4px solid {_conf_color};'>"
        f"<div style='font-size:0.85rem; color:#475569;'>Average data confidence</div>"
        f"<div style='font-size:1.3rem; font-weight:800; color:{_conf_color};'>"
        f"{_avg_conf:.0f}%</div>"
        f"</div>",
        unsafe_allow_html=True,
    )

# ============================================================================
# NAVIGATION
# ============================================================================

st.markdown("---")
col1, col2, col3, col4 = st.columns([1, 1, 1, 2])

with col1:
    if st.button("Home", key="s3p_home"):
        st.switch_page("planning_guide.py")

with col2:
    if st.button("Back", key="s3p_back"):
        st.switch_page("pages/2plus_Review_Data.py")

with col3:
    if st.button("Continue", type="primary", key="s3p_next"):
        st.switch_page("pages/4plus_Recommendations.py")

with col4:
    st.markdown(
        "<div style='text-align:right; color:#94a3b8; font-size:0.85rem; "
        "padding-top:0.5rem;'>Step 3+ of 7</div>",
        unsafe_allow_html=True,
    )
