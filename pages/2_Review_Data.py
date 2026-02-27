"""
Page 2: Review Data Inputs

This page displays data inputs required for the selected analysis type,
with proxy alternatives and confidence estimates.
"""

import streamlit as st
from config.data_inputs import get_data_inputs, get_proxy_options_for_context, get_proxy_confidence
from config.sensitivity_config import get_importance_rank, get_sensitivity_weight
from utils.sensitivity_plots import (
    create_tornado_chart, create_parameter_sweeps,
    create_oat_waterfall, create_oat_radar,
    create_global_sa_importance, create_global_sa_beeswarm,
    create_global_parallel_coords, create_global_correlation_heatmap,
    create_combined_importance,
)
from utils.shared_css import inject_shared_css, render_step_indicator, recommended_source_badge, render_sidebar_cards

st.set_page_config(page_title="Review Data", layout="wide")

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
render_step_indicator(2)


# Contextual data source links by data item key
# Maps item keys (or key patterns) to relevant source URLs
DATA_SOURCE_LINKS = {
    # Building Geometry
    "footprint":      [("OpenStreetMap", "https://www.openstreetmap.org"), ("Google Earth", "https://earth.google.com")],
    "height":         [("OpenStreetMap", "https://www.openstreetmap.org"), ("Google Earth", "https://earth.google.com")],
    "num_floors":     [("OpenStreetMap", "https://www.openstreetmap.org"), ("Google Earth", "https://earth.google.com")],
    "wwr":            [("Google Street View", "https://www.google.com/streetview/")],
    "orientation":    [("OpenStreetMap", "https://www.openstreetmap.org"), ("Google Maps", "https://maps.google.com")],
    "has_basement":   [],
    "roof_shape_angle": [("Google Earth", "https://earth.google.com")],
    "roof_area":      [("Google Earth", "https://earth.google.com")],
    # Building Fabric & Construction
    "year_construction":     [("OpenStreetMap", "https://www.openstreetmap.org")],
    "construction_materials": [],
    "window_properties":     [],
    "infiltration_rate":     [],
    # Building Systems
    "hvac_type":    [],
    "hvac_system":  [],
    "setpoint":     [],
    "supply_temp":  [],
    # Energy Data
    "annual_electricity":     [],
    "annual_heating_cooling": [],
    "annual_heating_demand":  [],
    "onsite_production":      [],
    "grid_emission_factor":   [("IPCC", "https://www.ipcc.ch"), ("IEA", "https://www.iea.org/data-and-statistics")],
    # Building Use & Operation
    "use_type":           [("OpenStreetMap", "https://www.openstreetmap.org")],
    "building_use":       [("OpenStreetMap", "https://www.openstreetmap.org")],
    "operating_hours":    [],
    "occupancy_pattern":  [],
    # Location & Climate
    "location":               [("Google Maps", "https://maps.google.com")],
    "building_location":      [("Google Maps", "https://maps.google.com"), ("OpenStreetMap", "https://www.openstreetmap.org")],
    "context_location_height": [("Google Earth", "https://earth.google.com")],
    # Renewable / PV
    "pv_module":           [],
    "installing_battery":  [],
}

# Country-specific sources to append
COUNTRY_SOURCE_LINKS = {
    "Sweden": {
        "footprint":    [("Lantmäteriet", "https://www.lantmateriet.se")],
        "height":       [("Lantmäteriet", "https://www.lantmateriet.se")],
        "num_floors":   [("SCB", "https://www.scb.se")],
        "year_construction": [("SCB", "https://www.scb.se")],
        "annual_electricity": [("Energimyndigheten", "https://www.energimyndigheten.se")],
        "annual_heating_cooling": [("Energimyndigheten", "https://www.energimyndigheten.se")],
        "annual_heating_demand":  [("Energimyndigheten", "https://www.energimyndigheten.se")],
        "grid_emission_factor":   [("Energimyndigheten", "https://www.energimyndigheten.se")],
        "location":     [("Lantmäteriet", "https://www.lantmateriet.se")],
        "building_location": [("Lantmäteriet", "https://www.lantmateriet.se")],
    },
    "Germany": {
        "footprint":    [("ALKIS", "https://www.adv-online.de")],
        "annual_electricity": [("DENA", "https://www.dena.de")],
        "grid_emission_factor": [("UBA", "https://www.umweltbundesamt.de")],
    },
    "United Kingdom": {
        "annual_electricity": [("EPC Register", "https://www.gov.uk/find-energy-certificate")],
        "year_construction":  [("EPC Register", "https://www.gov.uk/find-energy-certificate")],
        "grid_emission_factor": [("BEIS", "https://www.gov.uk/government/organisations/department-for-energy-security-and-net-zero")],
    },
    "Denmark": {
        "annual_electricity": [("Danish Energy Agency", "https://ens.dk")],
        "footprint":    [("SDFI", "https://sdfi.dk")],
    },
    "Norway": {
        "annual_electricity": [("NVE", "https://www.nve.no")],
        "footprint":    [("Kartverket", "https://www.kartverket.no")],
    },
    "Finland": {
        "annual_electricity": [("Statistics Finland", "https://www.stat.fi")],
        "footprint":    [("NLS Finland", "https://www.maanmittauslaitos.fi")],
    },
}


def _get_source_links(item_key: str, context: str = None):
    """Get combined universal + country-specific source links for a data item."""
    links = list(DATA_SOURCE_LINKS.get(item_key, []))
    if context and context in COUNTRY_SOURCE_LINKS:
        country_links = COUNTRY_SOURCE_LINKS[context].get(item_key, [])
        # Add country links, avoiding duplicates by name
        existing_names = {name for name, _ in links}
        for name, url in country_links:
            if name not in existing_names:
                links.append((name, url))
    return links


def _render_data_item(item: dict, page_key: str, context: str = None,
                      analysis_type_str: str = None):
    """
    Render a single data item with Yes/No selection and proxy options with confidence.
    """
    item_key = item["key"]
    item_label = item["label"]
    item_type = item.get("type", "standard")
    recommended_source = item.get("recommended_source", "") or "To be defined"
    default_proxy_options = item.get("proxy_options", [])
    
    # Get context-aware proxy options
    proxy_options = get_proxy_options_for_context(context, item_key, default_proxy_options)
    
    # Sensitivity importance ranking badge (analysis-type aware)
    imp = get_importance_rank(item_key, analysis_type_str)
    badge_html = (
        f"<span style='display:inline-flex; align-items:center; gap:4px; "
        f"background:{imp['color']}18; border:1px solid {imp['color']}40; "
        f"color:{imp['color']}; font-size:0.72rem; font-weight:600; "
        f"padding:1px 8px; border-radius:10px; margin-left:8px; "
        f"vertical-align:middle;'>"
        f"{imp['icon']} {imp['label']}</span>"
    )
    
    # Data item label with importance badge
    st.markdown(
        f"<span style='font-weight:700;'>{item_label}</span>{badge_html}",
        unsafe_allow_html=True,
    )
    
    # Show recommended data source (smaller font)
    st.markdown(
        f"<span style='font-size: 0.85rem; color: #64748b;'>"
        f"*Recommended data source:* {recommended_source}</span>",
        unsafe_allow_html=True
    )
    
    # Yes/No radio - default to Yes
    has_data_key = f"{page_key}_{item_key}_has_data"
    has_data = st.radio(
        "Do you have this data?",
        options=["Yes", "No"],
        key=has_data_key,
        horizontal=True,
        index=0,
        label_visibility="collapsed"
    )
    
    if has_data == "Yes":
        recommended_source_badge()
    else:
        # Show proxy options with confidence
        if proxy_options:
            proxy_key = f"{page_key}_{item_key}_proxy"
            selected_proxy = st.selectbox(
                "Select proxy:", 
                options=proxy_options, 
                key=proxy_key,
                label_visibility="collapsed"
            )
            
            # Get and display confidence for selected proxy
            confidence_info = get_proxy_confidence(context, item_key, selected_proxy)
            confidence_val = confidence_info.get("confidence")
            confidence_source = confidence_info.get("source", "unknown")
            confidence_ref = confidence_info.get("reference", "")
            
            if confidence_val is not None:
                # Determine color based on confidence level
                if confidence_val >= 85:
                    color = "#33A9A0"  # teal
                    level = "Good"
                elif confidence_val >= 70:
                    color = "#33528A"  # navy
                    level = "Moderate"
                else:
                    color = "#597001"  # dark olive
                    level = "Low"
                
                # Show confidence with estimated badge and tooltip
                source_badge = "Estimated" if confidence_source == "estimated" else "Validated"
                st.markdown(
                    f"<div style='display: flex; align-items: center; gap: 8px; margin-top: 4px;'>"
                    f"<span style='font-size: 0.9rem;'>Confidence: </span>"
                    f"<span style='background-color: {color}; color: white; padding: 2px 8px; "
                    f"border-radius: 4px; font-weight: 600;'>{confidence_val}% ({level})</span>"
                    f"<span style='font-size: 0.75rem; color: #94a3b8; cursor: help;' "
                    f"title='{confidence_ref}'>{source_badge}</span>"
                    f"</div>",
                    unsafe_allow_html=True
                )
            else:
                st.caption("Confidence not yet estimated for this proxy")
        else:
            st.caption("No proxy options available yet")

        # Show contextual "Where to find this data" links
        source_links = _get_source_links(item_key, context)
        if source_links:
            links_html = " · ".join(
                f"<a href='{url}' target='_blank' style='color:#33528A; text-decoration:none; font-weight:500;'>{name}</a>"
                for name, url in source_links
            )
            st.markdown(
                f"<div style='margin-top:6px; font-size:0.85rem; color:#64748b;'>"
                f"Sources: {links_html}"
                f"</div>",
                unsafe_allow_html=True
            )
    
    # Handle yes_no type questions with followup
    if item_type == "yes_no":
        followup_label = item.get("followup_label", "Additional details")
        yes_no_key = f"{page_key}_{item_key}_yesno"
        answer = st.radio(
            item_label,
            options=["Yes", "No"],
            key=yes_no_key,
            horizontal=True,
            label_visibility="collapsed"
        )
        if answer == "Yes":
            followup_key = f"{page_key}_{item_key}_followup"
            st.text_input(followup_label, key=followup_key)
    
    # Separator
    st.markdown("---")


# ============================================================================
# CHECK PREREQUISITES
# ============================================================================

if "analysis_type" not in st.session_state or not st.session_state.analysis_type:
    st.warning("Please complete Step 1 first.")
    if st.button("Go to Step 1"):
        st.switch_page("pages/1_Define_Scope_and_Context.py")
    st.stop()

# ============================================================================
# GET SELECTIONS FROM PAGE 1
# ============================================================================

analysis_type = st.session_state.get("analysis_type", [])
if isinstance(analysis_type, list):
    analysis_type_str = analysis_type[0] if analysis_type else "None"
else:
    analysis_type_str = analysis_type

analysis_focus = st.session_state.get("analysis_focus") or st.session_state.get("energy_system_focus", "")
analysis_scale = st.session_state.get("analysis_scale") or st.session_state.get("project_scale", "")
analysis_context = st.session_state.get("analysis_context") or st.session_state.get("country", "")
renewable_types = st.session_state.get("renewable_types", [])
urban_design_types = st.session_state.get("urban_design_types", [])
climate_resilience_types = st.session_state.get("climate_resilience_types", [])

# ============================================================================
# PAGE HEADER
# ============================================================================


# --- SMALLER HEADER & CONTEXT ---
st.markdown("<h2 style='font-size:1.5rem; font-weight:700; color:#0f172a; letter-spacing:-0.01em; margin-bottom:0.5rem;'>Step 2: Review Data Inputs</h2>", unsafe_allow_html=True)
st.markdown(
    "<p style='font-size:0.92rem; color:#64748b; margin-top:-0.5rem; margin-bottom:0.7rem;'>Review the required data inputs and select proxy alternatives if needed.</p>",
    unsafe_allow_html=True
)
context_info = f"<span style='font-size:0.88rem; color:#475569;'><b>Analysis Type:</b> {analysis_type_str}"
if analysis_focus:
    context_info += f" / <b>{analysis_focus}</b>"
if analysis_scale:
    context_info += f" | <b>Scale:</b> {analysis_scale}"
if analysis_context:
    context_info += f" | <b>Context:</b> {analysis_context}"
if renewable_types:
    context_info += f" | <b>Renewable:</b> {', '.join(renewable_types)}"
context_info += "</span>"
st.markdown(context_info, unsafe_allow_html=True)

# ============================================================================
# GET DATA INPUTS (must be before card row)
# ============================================================================

data_inputs = get_data_inputs(
    analysis_type, 
    analysis_focus, 
    analysis_scale, 
    analysis_context, 
    renewable_types, 
    urban_design_types, 
    climate_resilience_types
)

if not data_inputs:
    st.warning(f"No data inputs configured yet for this analysis type and focus.")
    st.info("Please go back to Step 1 and select a valid combination, or check config/data_inputs.py")
    if st.button("Back to Step 1"):
        st.switch_page("pages/1_Define_Scope_and_Context.py")
    st.stop()

# Create unique key for this configuration
renewable_str = "_".join(renewable_types) if renewable_types else "none"
urban_str = "_".join(urban_design_types) if urban_design_types else "none"
climate_str = "_".join(climate_resilience_types) if climate_resilience_types else "none"
page_key = f"page2_{analysis_type_str}_{analysis_focus}_{analysis_scale}_{analysis_context}_{renewable_str}_{urban_str}_{climate_str}".replace(" ", "_").replace("&", "and")

if f"{page_key}_responses" not in st.session_state:
    st.session_state[f"{page_key}_responses"] = {}

# --- CARD ROW (HOME PAGE STYLE) ---
all_items = []
for category_data in data_inputs:
    all_items.extend(category_data["items"])
available = 0
missing = 0
confidences = []
for item in all_items:
    item_key = item["key"]
    has_data_key = f"{page_key}_{item_key}_has_data"
    has_data = st.session_state.get(has_data_key, "Yes")
    if has_data == "Yes":
        available += 1
    else:
        missing += 1
        proxy_key = f"{page_key}_{item_key}_proxy"
        selected_proxy = st.session_state.get(proxy_key)
        if selected_proxy:
            conf_info = get_proxy_confidence(analysis_context, item_key, selected_proxy)
            conf_val = conf_info.get("confidence")
            if conf_val is not None:
                confidences.append(conf_val)
avg_conf = round(sum(confidences)/len(confidences), 1) if confidences else None
avg_conf_display = f"{avg_conf}%" if avg_conf is not None else "N/A"


# ============================================================================
# SENSITIVITY ANALYSIS DIALOG
# ============================================================================

@st.dialog("Sensitivity Analysis Results", width="large")
def show_sensitivity_analysis():
    """Interactive sensitivity analysis visualization with OAT and Global SA."""
    st.markdown(
        "<p style='color: #64748b; font-size: 0.92rem; margin-bottom: 0.5rem;'>"
        "Results from sensitivity analysis on a reference building energy model. "
        "These results show how each input parameter impacts annual heating demand "
        "and are used to weight confidence scores.</p>",
        unsafe_allow_html=True,
    )

    tab_oat, tab_global, tab_compare = st.tabs([
        "One-at-a-Time (OAT)",
        "Global SA (200 runs)",
        "OAT vs Global Comparison",
    ])

    with tab_oat:
        st.markdown(
            "Each parameter was varied **independently** while all others "
            "were held at their baseline value."
        )
        oat_view = st.radio(
            "Visualisation",
            ["Tornado Chart", "Parameter Sweeps", "Waterfall", "Radar"],
            horizontal=True, key="sa_oat_view",
        )
        if oat_view == "Tornado Chart":
            fig = create_tornado_chart()
            st.plotly_chart(fig, key="sa_tornado", width="stretch")
            st.caption("Bars show the total output range (MWh/year) caused by varying each parameter across its full range.")
        elif oat_view == "Parameter Sweeps":
            fig = create_parameter_sweeps()
            st.plotly_chart(fig, key="sa_sweeps", width="stretch")
            st.caption("Line charts show how annual heating changes as each parameter varies. Diamond marks baseline.")
        elif oat_view == "Waterfall":
            fig = create_oat_waterfall()
            st.plotly_chart(fig, key="sa_waterfall", width="stretch")
            st.caption("Waterfall shows how each parameter\u2019s uncertainty accumulates into total output uncertainty.")
        elif oat_view == "Radar":
            fig = create_oat_radar()
            st.plotly_chart(fig, key="sa_radar", width="stretch")
            st.caption("Radar chart shows the relative importance of each OAT parameter.")

    with tab_global:
        st.markdown(
            "All parameters were varied **simultaneously** across 200 "
            "simulations, capturing interaction effects."
        )
        gsa_view = st.radio(
            "Visualisation",
            ["SHAP Beeswarm", "Feature Importance", "Parallel Coordinates",
             "Correlation Heatmap"],
            horizontal=True, key="sa_gsa_view",
        )
        if gsa_view == "SHAP Beeswarm":
            fig = create_global_sa_beeswarm()
            st.plotly_chart(fig, key="sa_beeswarm", width="stretch")
            st.caption("Each dot is one simulation. Colour shows the parameter\u2019s value. Spread shows impact.")
        elif gsa_view == "Feature Importance":
            fig = create_global_sa_importance()
            st.plotly_chart(fig, key="sa_global_imp", width="stretch")
            st.caption("|Spearman \u03c1| measures monotonic correlation between each parameter and the output.")
        elif gsa_view == "Parallel Coordinates":
            fig = create_global_parallel_coords()
            st.plotly_chart(fig, key="sa_parcoords", width="stretch")
            st.caption("Each line is one simulation run through its parameter values. Colour: blue=low, red=high.")
        elif gsa_view == "Correlation Heatmap":
            fig = create_global_correlation_heatmap()
            st.plotly_chart(fig, key="sa_heatmap", width="stretch")
            st.caption("Pairwise Spearman correlations between all parameters and the output.")

    with tab_compare:
        st.markdown(
            "Side-by-side comparison of parameter importance from the OAT "
            "analysis and Global SA."
        )
        fig = create_combined_importance()
        st.plotly_chart(fig, key="sa_combined", width="stretch")
        st.caption("Parameters that rank high in both methods are the most critical.")


# ============================================================================
# TWO-COLUMN LAYOUT: data inputs (left) + sticky summary cards (right)
# ============================================================================

left_col, right_col = st.columns([0.65, 0.35])

# ── RIGHT COLUMN: sticky summary cards ─────────────────────────────
with right_col:
    sidebar_html = f"""
    <div class='sticky-sidebar'>
      <div class='pg-card-stack'>
        <div class='pg-card' style='background:rgba(51,169,160,0.10); border:1px solid rgba(51,169,160,0.25);'>
          <div class='pg-val' style='color:#33A9A0;'>{available}</div>
          <div class='pg-lbl'>Available Data</div>
        </div>
        <div class='pg-card' style='background:rgba(51,82,138,0.10); border:1px solid rgba(51,82,138,0.25);'>
          <div class='pg-val' style='color:#33528A;'>{missing}</div>
          <div class='pg-lbl'>Missing Data</div>
        </div>
        <div class='pg-card' style='background:rgba(138,182,46,0.10); border:1px solid rgba(138,182,46,0.25);'>
          <div class='pg-val' style='color:#8AB62E;'>{avg_conf_display}</div>
          <div class='pg-lbl'>Avg. Proxy Confidence</div>
        </div>
      </div>
      <div style='font-size:0.78rem; color:#597001; margin-bottom:0.5rem;'>
        Rankings weighted by sensitivity analysis impact.
      </div>
    </div>
    """
    st.markdown(sidebar_html, unsafe_allow_html=True)

    st.markdown(
        "<style>"
        "div[data-testid='stVerticalBlock']:has(#sa-small-btn) button "
        "{font-size:0.78rem!important; height:32px!important; padding:0 14px!important; min-height:0!important;}"
        "</style>"
        "<span id='sa-small-btn'></span>",
        unsafe_allow_html=True,
    )
    if st.button("Sensitivity Analysis", key="sa_dialog_btn",
                  help="View how each parameter impacts results"):
        show_sensitivity_analysis()

    # Sensitivity importance legend (3 tiers)
    st.markdown(
        "<div style='display:flex; flex-direction:column; gap:4px; margin-top:0.8rem; font-size:0.78rem;'>"
        "<span style='font-weight:600; color:#597001;'>Sensitivity ranking</span>"
        "<span style='color:#33A9A0; font-weight:600;'>🔴 High impact</span>"
        "<span style='color:#8AB62E; font-weight:600;'>🟡 Medium impact</span>"
        "<span style='color:#33528A; font-weight:600;'>🔵 Low impact</span>"
        "</div>",
        unsafe_allow_html=True,
    )

# ── LEFT COLUMN: data inputs ───────────────────────────────────────
with left_col:
    st.markdown("<hr style='margin: 0.3rem 0 0.7rem 0; border: none; border-top: 1px solid #e2e8f0;'>", unsafe_allow_html=True)
    st.markdown("<div style='font-size:1.02rem; font-weight:600; margin-bottom:0.2rem;'>Do you have the following data inputs?</div>", unsafe_allow_html=True)

    for category_data in data_inputs:
        category_name = category_data["category"]
        items = category_data["items"]
        # Sort items: most important first (highest weight → lowest)
        sorted_items = sorted(
            items,
            key=lambda it: get_sensitivity_weight(it["key"], analysis_type_str),
            reverse=True,
        )
        with st.expander(category_name, expanded=False):
            for item in sorted_items:
                _render_data_item(item, page_key, analysis_context, analysis_type_str)


# ============================================================================
# NAVIGATION
# ============================================================================

st.markdown("---")
col1, col2, col3 = st.columns([1, 1, 2])

with col1:
    if st.button("Back", use_container_width=True):
        st.switch_page("pages/1_Define_Scope_and_Context.py")

with col2:
    if st.button("Continue", type="primary", use_container_width=True):
        st.switch_page("pages/3_Analysis_Method.py")

with col3:
    st.markdown(
        "<div style='text-align: right; color: #94a3b8; font-size: 0.85rem; padding-top: 0.5rem;'>"
        "Step 2 of 6</div>",
        unsafe_allow_html=True
    )
