"""
Page 2+: Review Data  (Step 1+ pipeline)

Project-type-driven data review page.
For **Renovation Planning** it falls through to the existing Step 2.
For **Energy Community Planning** and **Renewable Energy Planning** it
shows system-specific data inputs from config/step2plus_data_inputs.py
and the appropriate sensitivity analysis.
"""

import streamlit as st
import folium
from streamlit_folium import st_folium
from config.step2plus_data_inputs import get_ec_data_inputs, get_re_data_inputs, get_renovation_data_inputs
from config.sensitivity_config import (
    get_importance_rank, get_sensitivity_weight,
    SOLAR_PV_BASELINE, SOLAR_PV_LABELS, SOLAR_PV_OAT_ANNUAL,
    SOLAR_PV_OAT_WINTER, SOLAR_PV_OAT_SPECIFIC_YIELD,
    SOLAR_PV_MORRIS, SOLAR_PV_DESCRIPTIONS,
    OAT_PARAMETERS, BASELINE_HEATING_KWH,
)
from config.data_inputs import get_proxy_confidence
from utils.shared_css import inject_shared_css, render_step_indicator, render_top_cards, render_branded_top_bar
from utils.location_data import (
    has_location_database,
    get_nearby_epc_snapshot,
    get_epc_snapshot_for_bbox,
    geocode_address,
    get_epc_building_passport,
)
from utils.tabula_matching import (
    match_archetype,
    match_confidence,
    epc_to_building_type,
    year_to_tabula_period,
    compute_epc_tabula_delta,
    get_tabula_energy_for_zone,
    climate_zone_from_county,
    climate_zone_from_lat,
    get_all_archetypes_summary,
    BUILDING_TYPE_LABELS,
)
from utils.data_requirements import (
    assess_coverage,
    compute_confidence_score,
    group_by_category,
)

st.set_page_config(page_title="Review Data (Step 2+)", layout="wide")
inject_shared_css()


def _is_missing(value):
    text = str(value).strip().lower()
    return value is None or text in {"", "<na>", "nan", "none"}


def _display_value(value, suffix: str = ""):
    if _is_missing(value):
        return "—"
    return f"{value}{suffix}"


def _safe_id_text(value):
    try:
        return str(int(value))
    except (TypeError, ValueError):
        return "N/A"


def _normalize_address_text(text: str) -> str:
    return " ".join(str(text or "").strip().lower().replace(",", " ").split())


def _prepare_single_building_snapshot(snapshot: dict, address_query: str = ""):
    """Reduce a nearby snapshot to one EPC-linked building, preferring address match when possible."""
    points_df = snapshot.get("points")
    if points_df is None or points_df.empty:
        return snapshot, None, False

    working = points_df.copy()
    selected_df = None
    matched_by_query = False

    query_norm = _normalize_address_text(address_query)
    if query_norm and "address" in working.columns:
        addr_norm = working["address"].fillna("").astype(str).map(_normalize_address_text)
        candidates = working[addr_norm.str.contains(query_norm, regex=False)]

        if candidates.empty:
            # fallback: try "street + number" token match from query prefix
            query_head = " ".join(query_norm.split()[:2]).strip()
            if query_head:
                candidates = working[addr_norm.str.contains(query_head, regex=False)]

        if not candidates.empty:
            selected_df = candidates.sort_values("distance_m", ascending=True).head(1).copy()
            matched_by_query = True

    if selected_df is None:
        selected_df = working.sort_values("distance_m", ascending=True).head(1).copy()

    snapshot["points"] = selected_df
    snapshot["sample"] = selected_df[
        ["address", "post_town", "municipality", "energy_class", "energy_performance"]
    ]
    snapshot["classes"] = selected_df[["energy_class"]].copy()
    snapshot["classes"]["energy_class"] = snapshot["classes"]["energy_class"].fillna("Unknown")
    snapshot["classes"]["records"] = 1

    has_epc = 1 if selected_df["energy_performance"].notna().any() else 0
    has_class = 1 if selected_df["energy_class"].notna().any() else 0
    has_link = 1 if selected_df["FormularId"].notna().any() else 0
    snapshot["summary"] = {
        "footprint_points": 1,
        "footprint_buildings": 1,
        "epc_linked_buildings": has_link,
        "epc_records": has_link,
        "has_energy_class": has_class,
        "has_energy_performance": has_epc,
        "has_build_year": 1 if selected_df["build_year"].notna().any() else 0,
        "has_atemp": 1 if selected_df["atemp"].notna().any() else 0,
        "radius_m": 0,
    }

    chosen_addr = selected_df.iloc[0].get("address") if not selected_df.empty else None
    return snapshot, chosen_addr, matched_by_query

# Hide sidebar + tighter spacing for data items
st.markdown("""
<style>
    [data-testid="stSidebarNav"] {display: none;}
    section[data-testid="stSidebar"] {display: none;}

    /* Page background */
    .stApp { background: #f8fafc !important; }

    /* Compact spacing inside expanders */
    .s2p-item { margin-bottom: 0.15rem; padding-bottom: 0.15rem;
                border-bottom: 1px solid #f1f5f9; }
    .s2p-item:last-child { border-bottom: none; }
    .s2p-subhdr { font-family: 'Inter', sans-serif; font-size: 0.78rem;
                   font-weight: 700; color: #334155;
                   margin: 0.6rem 0 0.25rem 0; text-transform: uppercase;
                   letter-spacing: 0.06em; }

    /* SA banner card style */
    .sa-banner {
        border-radius: 16px;
        padding: 1.1rem 1.4rem;
        display: flex;
        align-items: center;
        gap: 1rem;
        margin: 0.8rem 0;
        border: 1px solid;
        transition: box-shadow 0.2s ease;
    }
    .sa-banner:hover {
        box-shadow: 0 2px 12px rgba(0,0,0,0.06);
    }

    /* Fix expander header icon/text overlap.
       Streamlit 1.53 renders a <span> with ligature text
       "keyboard_arrow_down" as the icon. We hide it by
       zeroing font-size on the heading row, then restoring
       it only on the label wrapper <div> inside. */
    div[data-testid="stExpander"] summary {
        list-style: none !important;
    }
    div[data-testid="stExpander"] summary::marker,
    div[data-testid="stExpander"] summary::-webkit-details-marker {
        display: none !important;
        content: "" !important;
    }
    /* The heading <span> wraps icon-span + label-div.
       Zero out ALL text so the ligature text vanishes. */
    div[data-testid="stExpander"] summary > span {
        font-size: 0 !important;
        line-height: 0 !important;
    }
    /* Restore font-size ONLY on the label wrapper <div> */
    div[data-testid="stExpander"] summary > span > div {
        font-size: 0.875rem !important;
        line-height: 1.4 !important;
    }
    div[data-testid="stExpander"] summary p {
        margin: 0 !important;
        font-size: 0.875rem !important;
        line-height: 1.35 !important;
        white-space: normal !important;
    }
</style>
""", unsafe_allow_html=True)

# ============================================================================
# PREREQUISITES
# ============================================================================

project_type = st.session_state.get("project_type")
if not project_type or st.session_state.get("pipeline_mode") != "step1plus":
    st.warning("Please complete Step 1+ first.")
    if st.button("Go to Step 1+"):
        st.switch_page("pages/0_Define_Project.py")
    st.stop()

systems = st.session_state.get("systems_in_scope", [])
ec_focus = st.session_state.get("ec_energy_focus", [])
ec_existing_pv = st.session_state.get("ec_existing_pv", False)
ec_existing_battery = st.session_state.get("ec_existing_battery", False)
country = st.session_state.get("country", "")
building_uses = st.session_state.get("building_uses", [])
is_residential = "Residential" in building_uses if building_uses else True

# Renovation Planning session state
reno_envelope = st.session_state.get("renovation_envelope_components", [])
reno_existing_heating = st.session_state.get("renovation_existing_heating", "No") == "Yes"
reno_existing_cooling = st.session_state.get("renovation_existing_cooling", "No") == "Yes"
reno_existing_dhw = st.session_state.get("renovation_existing_dhw", "No") == "Yes"
reno_cost_kpi = "Cost" in st.session_state.get("selected_kpis", [])

# ============================================================================
# PAGE HEADER
# ============================================================================

render_branded_top_bar(
    "Step 2+: Data Coverage & Configuration",
    "Understand what we already know about your asset, identify data gaps, and configure the workflow for missing inputs.",
)
render_step_indicator(2)

# Context bar — styled card with pill chips
_chips = []
_chips.append(
    f"<span style='display:inline-flex; align-items:center; gap:0.3rem; "
    f"background:rgba(51,82,138,0.08); border:1px solid rgba(51,82,138,0.15); "
    f"color:#33528A; padding:0.25rem 0.75rem; border-radius:999px; "
    f"font-size:0.78rem; font-weight:600; font-family:Inter,sans-serif;'>"
    f"📋 {project_type}</span>"
)
if project_type == "Energy Community Planning" and ec_focus:
    _chips.append(
        f"<span style='display:inline-flex; align-items:center; gap:0.3rem; "
        f"background:rgba(51,169,160,0.08); border:1px solid rgba(51,169,160,0.15); "
        f"color:#115e59; padding:0.25rem 0.75rem; border-radius:999px; "
        f"font-size:0.78rem; font-weight:600; font-family:Inter,sans-serif;'>"
        f"🎯 {', '.join(ec_focus) if isinstance(ec_focus, list) else ec_focus}</span>"
    )
if systems:
    _chips.append(
        f"<span style='display:inline-flex; align-items:center; gap:0.3rem; "
        f"background:rgba(196,232,29,0.10); border:1px solid rgba(196,232,29,0.22); "
        f"color:#597001; padding:0.25rem 0.75rem; border-radius:999px; "
        f"font-size:0.78rem; font-weight:600; font-family:Inter,sans-serif;'>"
        f"⚙️ {len(systems)} system{'s' if len(systems) != 1 else ''}</span>"
    )
if country:
    _chips.append(
        f"<span style='display:inline-flex; align-items:center; gap:0.3rem; "
        f"background:#f1f5f9; border:1px solid #e2e8f0; "
        f"color:#334155; padding:0.25rem 0.75rem; border-radius:999px; "
        f"font-size:0.78rem; font-weight:600; font-family:Inter,sans-serif;'>"
        f"📍 {country}</span>"
    )
_ctx = (
    f"<div style='display:flex; flex-wrap:wrap; gap:0.5rem; align-items:center; "
    f"padding:0.7rem 1rem; background:#ffffff; border:1px solid #e2e8f0; "
    f"border-radius:14px; box-shadow:0 1px 3px rgba(0,0,0,0.03); margin-bottom:0.5rem;'>"
    f"{''.join(_chips)}</div>"
)
st.markdown(_ctx, unsafe_allow_html=True)

# ============================================================================
# BUILD DATA INPUTS
# ============================================================================

if project_type == "Energy Community Planning":
    data_inputs = get_ec_data_inputs(
        systems, focus=ec_focus,
        existing_pv=ec_existing_pv, existing_battery=ec_existing_battery,
        is_residential=is_residential,
    )
    sa_analysis_type = None  # EC uses default weights for now
elif project_type == "Renewable Energy Planning":
    data_inputs = get_re_data_inputs(systems)
    sa_analysis_type = "Renewable Energy & Local Production"
elif project_type == "Renovation Planning":
    data_inputs = get_renovation_data_inputs(
        systems,
        envelope_components=reno_envelope,
        existing_heating=reno_existing_heating,
        existing_cooling=reno_existing_cooling,
        existing_dhw=reno_existing_dhw,
        cost_kpi=reno_cost_kpi,
    )
    sa_analysis_type = None
else:
    data_inputs = []
    sa_analysis_type = None

if not data_inputs:
    st.warning("No data inputs for the selected systems. Please go back and adjust your scope.")
    if st.button("Back to Step 1+"):
        st.switch_page("pages/0_Define_Project.py")
    st.stop()

# Unique page key for widget state
page_key = (
    f"s2p_{project_type}_{ec_focus}_"
    f"{'_'.join(sorted(systems))}"
).replace(" ", "_").replace("(", "").replace(")", "")


# ============================================================================
# PROXY SOURCE URLS  (same mapping as Step 2)
# ============================================================================

PROXY_SOURCE_URLS = {
    "Lantmäteriet database":          "https://www.lantmateriet.se",
    "Laser data from Lantmäteriet":   "https://www.lantmateriet.se",
    "EUBUCCO database":               "https://eubucco.com/",
    "OpenStreetMap":                   "https://www.openstreetmap.org",
    "Google Street View":             "https://www.google.com/streetview/",
    "Google Street Maps":             "https://maps.google.com",
    "Google Earth":                   "https://earth.google.com",
    "Energy Performance Certificate": "https://www.boverket.se/en/start/building-in-sweden/energy-performance-certificates/",
    "SCB":                            "https://www.scb.se",
    "Energimyndigheten":              "https://www.energimyndigheten.se",
}


def _source_links(proxy_options):
    links, seen = [], set()
    for p in proxy_options:
        url = PROXY_SOURCE_URLS.get(p)
        if url and p not in seen:
            links.append((p, url))
            seen.add(p)
    return links


# ============================================================================
# RENDER HELPERS
# ============================================================================

def _render_item(item, analysis_type_str=None):
    """Render one data-input item compactly with Yes/No + proxy."""
    item_key = item["key"]
    item_label = item["label"]
    item_type = item.get("type", "standard")
    recommended_source = item.get("recommended_source", "") or "To be defined"
    proxy_options = item.get("proxy_options", [])

    # Importance badge (inline, small)
    imp = get_importance_rank(item_key, analysis_type_str)
    badge = (
        f"<span style='display:inline-flex; align-items:center; gap:3px; "
        f"background:{imp['color']}18; border:1px solid {imp['color']}40; "
        f"color:{imp['color']}; font-size:0.68rem; font-weight:600; "
        f"padding:0px 6px; border-radius:8px; margin-left:6px; "
        f"vertical-align:middle;'>"
        f"{imp['icon']} {imp['label']}</span>"
    )
    st.markdown(
        f"<div style='margin-bottom:2px;'>"
        f"<span style='font-weight:600; font-size:0.92rem;'>{item_label}</span>{badge}"
        f"</div>",
        unsafe_allow_html=True,
    )

    # ── "select" type: show a selectbox with predefined options ──────
    if item_type == "select":
        sel_key = f"{page_key}_{item_key}_sel"
        options = item.get("options", [])
        st.selectbox(
            item_label, options,
            key=sel_key, label_visibility="collapsed",
        )
        # Thin separator
        st.markdown(
            "<div style='border-bottom:1px solid #f1f5f9; margin:0.25rem 0;'></div>",
            unsafe_allow_html=True,
        )
        return

    # ── yes_no type: single Yes / No answer ─────────────────────────
    if item_type == "yes_no":
        yn_key = f"{page_key}_{item_key}_yn"
        st.radio(item_label, ["Yes", "No"], key=yn_key,
                 horizontal=True, label_visibility="collapsed")
        # Thin separator
        st.markdown(
            "<div style='border-bottom:1px solid #f1f5f9; margin:0.25rem 0;'></div>",
            unsafe_allow_html=True,
        )
        return

    # ── Standard: "Do you have this data?" ───────────────────────────
    has_key = f"{page_key}_{item_key}_has"
    has_data = st.radio(
        "Do you have this data?",
        ["Yes", "No"], key=has_key, horizontal=True, index=0,
        label_visibility="collapsed",
    )

    if has_data == "No":
        if proxy_options:
            proxy_key = f"{page_key}_{item_key}_proxy"
            selected_proxy = st.selectbox(
                "Select proxy:", proxy_options,
                key=proxy_key, label_visibility="collapsed",
            )
            ci = get_proxy_confidence(country, item_key, selected_proxy)
            cv = ci.get("confidence")
            if cv is not None:
                color = "#33A9A0" if cv >= 85 else "#33528A" if cv >= 70 else "#597001"
                level = "Good" if cv >= 85 else "Moderate" if cv >= 70 else "Low"
                st.markdown(
                    f"<span style='font-size:0.82rem;'>Confidence: </span>"
                    f"<span style='background-color:{color}; color:white; padding:1px 6px; "
                    f"border-radius:4px; font-size:0.8rem; font-weight:600;'>"
                    f"{cv}% ({level})</span>",
                    unsafe_allow_html=True,
                )
            links = _source_links(proxy_options)
            if links:
                lhtml = " · ".join(
                    f"<a href='{u}' target='_blank' style='color:#33528A; "
                    f"text-decoration:none; font-weight:500; font-size:0.8rem;'>{n}</a>"
                    for n, u in links
                )
                st.markdown(
                    f"<div style='font-size:0.8rem; color:#64748b;'>"
                    f"Sources: {lhtml}</div>",
                    unsafe_allow_html=True,
                )
        else:
            st.caption("No proxy options available yet")

    # Temporal resolution follow-up for demand profiles
    if item.get("temporal_resolution") and has_data == "Yes":
        tr_key = f"{page_key}_{item_key}_resolution"
        st.selectbox(
            "What temporal resolution do you have?",
            ["Hourly", "Daily", "Monthly", "Annual"],
            key=tr_key,
        )

    # Thin separator
    st.markdown(
        "<div style='border-bottom:1px solid #f1f5f9; margin:0.25rem 0;'></div>",
        unsafe_allow_html=True,
    )


# ============================================================================
# SENSITIVITY ANALYSIS DIALOG  (project-type specific)
# ============================================================================

@st.dialog("Sensitivity Analysis — Solar PV", width="large")
def show_re_sensitivity():
    """Solar PV OAT + Morris sensitivity analysis for Renewable Energy."""
    import plotly.graph_objects as go
    from plotly.subplots import make_subplots

    # ── Style override for scrollable dialog ─────────────────────────
    st.markdown(
        "<style>"
        "div[data-testid='stDialog'] section[data-testid='stVerticalBlockBorderWrapper'] "
        "{overflow-y:auto !important; max-height:82vh !important;}"
        "</style>",
        unsafe_allow_html=True,
    )

    # ── Colour palette ───────────────────────────────────────────────
    TEAL   = "#33A9A0"
    NAVY   = "#33528A"
    LIME   = "#8AB62E"
    CORAL  = "#FF6B6B"
    AMBER  = "#F59E0B"
    PURPLE = "#8B5CF6"
    GREEN  = "#22C55E"
    BG     = "rgba(0,0,0,0)"
    GRID   = "rgba(0,0,0,0.06)"

    # ── Shortcuts ────────────────────────────────────────────────────
    labels = SOLAR_PV_LABELS
    oat_a  = SOLAR_PV_OAT_ANNUAL
    base   = SOLAR_PV_BASELINE

    # Sort parameters by annual max swing descending (skip albedo=0)
    sorted_annual = sorted(
        ((p, v) for p, v in oat_a.items() if v[2] > 0),
        key=lambda x: x[1][2], reverse=True,
    )
    top3 = [labels[p] for p, _ in sorted_annual[:3]]

    # ── Header KPI cards ─────────────────────────────────────────────
    st.markdown(
        "<p style='color:#64748b; font-size:0.86rem; margin-bottom:0.2rem;'>"
        "Results from OAT and Morris screening analyses on a reference solar PV "
        "system (rooftop + façade-integrated, Swedish climate). "
        "Shows which design and site parameters most affect PV production.</p>",
        unsafe_allow_html=True,
    )

    _card = (
        "<div style='background:{bg}; border-radius:10px; padding:10px 12px; "
        "text-align:center; border:1px solid {bd};'>"
        "<div style='font-size:1.25rem; font-weight:700; color:{c};'>{v}</div>"
        "<div style='font-size:0.7rem; color:#64748b; margin-top:2px;'>{l}</div>"
        "</div>"
    )
    c1, c2, c3, c4 = st.columns(4)
    c1.markdown(_card.format(
        bg="rgba(51,169,160,0.08)", bd="rgba(51,169,160,0.2)",
        c=TEAL, v=f"{base['annual_kwh']/1000:.1f} MWh", l="Baseline Annual PV",
    ), unsafe_allow_html=True)
    c2.markdown(_card.format(
        bg="rgba(51,82,138,0.08)", bd="rgba(51,82,138,0.2)",
        c=NAVY, v=f"{base['winter_kwh']/1000:.1f} MWh", l="Baseline Winter (Oct–Mar)",
    ), unsafe_allow_html=True)
    c3.markdown(_card.format(
        bg="rgba(255,107,107,0.08)", bd="rgba(255,107,107,0.2)",
        c=CORAL, v=f"±{sorted_annual[0][1][2]:.0f}%", l=f"Top: {top3[0]}",
    ), unsafe_allow_html=True)
    c4.markdown(_card.format(
        bg="rgba(138,182,46,0.08)", bd="rgba(138,182,46,0.2)",
        c=LIME, v=f"{len(sorted_annual)}", l="Parameters Tested",
    ), unsafe_allow_html=True)

    st.markdown("<div style='height:10px'></div>", unsafe_allow_html=True)

    # ── Tabs ─────────────────────────────────────────────────────────
    tab1, tab2, tab3, tab4, tab5 = st.tabs([
        "Impact Butterfly",
        "Morris Screening",
        "Annual vs Winter",
        "Uncertainty Waterfall",
        "Stakeholder Guide",
    ])

    # ══════════════════════════════════════════════════════════════════
    # TAB 1 — BUTTERFLY CHART (asymmetric ← decrease | increase →)
    # ══════════════════════════════════════════════════════════════════
    with tab1:
        st.info(
            "**Impact Butterfly (OAT):** Each parameter is varied one-at-a-time "
            "from its low to high bound while all others stay at baseline. "
            "Bars to the left show production *decrease*, bars to the right "
            "show *increase*. Asymmetry between the two sides reveals "
            "non-linear behaviour.",
            icon="ℹ️",
        )

        y_labels = [labels[p] for p, _ in reversed(sorted_annual)]
        low_vals = [v[0] for _, v in reversed(sorted_annual)]
        high_vals = [v[1] for _, v in reversed(sorted_annual)]

        fig = go.Figure()
        # Left bars (low scenario)
        fig.add_trace(go.Bar(
            y=y_labels, x=low_vals, orientation="h",
            name="Low → Baseline",
            marker=dict(color=[CORAL if v < 0 else GREEN for v in low_vals],
                        line=dict(width=0)),
            hovertemplate="<b>%{y}</b><br>Low scenario: %{x:+.1f}%<extra></extra>",
            text=[f"{v:+.1f}%" for v in low_vals],
            textposition="outside",
            textfont=dict(size=9),
        ))
        # Right bars (high scenario)
        fig.add_trace(go.Bar(
            y=y_labels, x=high_vals, orientation="h",
            name="Baseline → High",
            marker=dict(color=[GREEN if v > 0 else CORAL for v in high_vals],
                        line=dict(width=0)),
            hovertemplate="<b>%{y}</b><br>High scenario: %{x:+.1f}%<extra></extra>",
            text=[f"{v:+.1f}%" for v in high_vals],
            textposition="outside",
            textfont=dict(size=9),
        ))
        fig.add_vline(x=0, line=dict(color="#475569", width=1.5))
        fig.update_layout(
            title=dict(text="OAT Butterfly — Annual PV Production (% change from baseline)",
                       font=dict(size=13, color="#1a1a2e")),
            xaxis=dict(title="Change in Annual Production (%)", gridcolor=GRID,
                       zeroline=False),
            yaxis=dict(title=""),
            barmode="overlay",
            height=max(400, 38 * len(sorted_annual)),
            margin=dict(l=10, r=80, t=50, b=40),
            plot_bgcolor=BG, paper_bgcolor=BG,
            showlegend=True,
            legend=dict(orientation="h", y=-0.12, x=0.5, xanchor="center",
                        font=dict(size=10)),
        )
        st.plotly_chart(fig, key="re_butterfly", use_container_width=True)

        # Insight callout
        st.info(
            f"🦋 **Key insight:** *{top3[0]}* has the most asymmetric impact — "
            f"reducing coverage drops production by **{abs(oat_a[sorted_annual[0][0]][0]):.0f}%** "
            f"while increasing it only adds **{oat_a[sorted_annual[0][0]][1]:.0f}%**. "
            f"This non-linearity means current coverage matters a lot."
        )

    # ══════════════════════════════════════════════════════════════════
    # TAB 2 — MORRIS SCREENING (μ* vs σ scatter)
    # ══════════════════════════════════════════════════════════════════
    with tab2:
        st.info(
            "**Morris Screening:** A global sensitivity method that varies all "
            "parameters simultaneously. **μ*** (x-axis) measures overall "
            "importance; **σ** (y-axis) measures interaction with other "
            "parameters. Upper-right = important AND interacting (needs "
            "careful attention). Bottom-right = important but linear "
            "(predictable). Bottom-left = negligible.",
            icon="ℹ️",
        )

        metric_choice = st.selectbox(
            "Output metric",
            ["Annual Production (kWh)", "Winter Production (kWh)", "Specific Yield (kWh/kWdc)"],
            key="morris_metric",
        )
        metric_key = {
            "Annual Production (kWh)": "annual_kwh",
            "Winter Production (kWh)": "winter_kwh",
            "Specific Yield (kWh/kWdc)": "specific_yield",
        }[metric_choice]

        morris = SOLAR_PV_MORRIS[metric_key]
        m_params = list(morris.keys())
        mu_stars = [morris[p][0] for p in m_params]
        sigmas   = [morris[p][1] for p in m_params]
        m_labels = [labels.get(p, p) for p in m_params]

        # Size by mu_star (normalised)
        mx_mu = max(mu_stars) if mu_stars else 1
        sizes = [max(8, 35 * (m / mx_mu)) for m in mu_stars]

        # Colour by σ/μ* ratio (interaction strength)
        ratios = [s / m if m > 0 else 0 for s, m in zip(sigmas, mu_stars)]

        fig = go.Figure()
        fig.add_trace(go.Scatter(
            x=mu_stars, y=sigmas,
            mode="markers+text",
            text=m_labels,
            textposition="top center",
            textfont=dict(size=8, color="#374151"),
            marker=dict(
                size=sizes, opacity=0.85,
                color=ratios,
                colorscale=[[0, TEAL], [0.5, AMBER], [1, CORAL]],
                showscale=True,
                colorbar=dict(title=dict(text="σ / μ*", font=dict(size=10)),
                              thickness=10, len=0.4),
                line=dict(width=1, color="white"),
            ),
            hovertemplate=(
                "<b>%{text}</b><br>"
                "μ* = %{x:,.0f}<br>"
                "σ = %{y:,.0f}<br>"
                "σ/μ* = %{customdata:.2f}<extra></extra>"
            ),
            customdata=ratios,
        ))

        # Quadrant guide lines (at median)
        med_mu = sorted(mu_stars)[len(mu_stars) // 2]
        med_sig = sorted(sigmas)[len(sigmas) // 2]
        fig.add_hline(y=med_sig, line=dict(color="#cbd5e1", width=1, dash="dot"))
        fig.add_vline(x=med_mu, line=dict(color="#cbd5e1", width=1, dash="dot"))

        # Quadrant annotations
        fig.add_annotation(x=0.98, y=0.98, xref="paper", yref="paper",
                           text="<b>Important +<br>Interacting</b>",
                           font=dict(size=9, color=CORAL), showarrow=False,
                           xanchor="right", yanchor="top")
        fig.add_annotation(x=0.98, y=0.02, xref="paper", yref="paper",
                           text="<b>Important +<br>Linear</b>",
                           font=dict(size=9, color=TEAL), showarrow=False,
                           xanchor="right", yanchor="bottom")
        fig.add_annotation(x=0.02, y=0.02, xref="paper", yref="paper",
                           text="<b>Negligible</b>",
                           font=dict(size=9, color="#94a3b8"), showarrow=False,
                           xanchor="left", yanchor="bottom")

        fig.update_layout(
            title=dict(text=f"Morris Screening — {metric_choice}",
                       font=dict(size=13, color="#1a1a2e")),
            xaxis=dict(title="μ* (Mean Absolute Effect)", gridcolor=GRID, type="log"),
            yaxis=dict(title="σ (Std Dev of Effect)", gridcolor=GRID, type="log"),
            height=520,
            margin=dict(l=10, r=10, t=50, b=40),
            plot_bgcolor=BG, paper_bgcolor=BG,
            showlegend=False,
        )
        st.plotly_chart(fig, key="re_morris", use_container_width=True)

        st.caption(
            "**How to read:** Large bubbles in the upper-right need the most care — "
            "they strongly affect results AND interact with other parameters. "
            "Teal (bottom-right) parameters are important but predictable (linear). "
            "Small grey bubbles (bottom-left) can safely use estimates."
        )

    # ══════════════════════════════════════════════════════════════════
    # TAB 3 — ANNUAL vs WINTER COMPARISON
    # ══════════════════════════════════════════════════════════════════
    with tab3:
        st.info(
            "**Annual vs Winter:** Compares each parameter's max % swing "
            "for full-year production versus winter only (Oct–Mar). "
            "Some parameters matter much more in winter — critical "
            "for Nordic climates where winter self-sufficiency is a "
            "design goal.",
            icon="ℹ️",
        )

        oat_w = SOLAR_PV_OAT_WINTER
        # Merge and sort by the larger of annual/winter swing
        all_params = set(oat_a.keys()) | set(oat_w.keys())
        combined = []
        for p in all_params:
            a_swing = oat_a.get(p, (0, 0, 0))[2]
            w_swing = oat_w.get(p, (0, 0, 0))[2]
            if a_swing > 0 or w_swing > 0:
                combined.append((p, a_swing, w_swing))
        combined.sort(key=lambda x: max(x[1], x[2]))

        comb_labels = [labels.get(p, p) for p, _, _ in combined]
        annual_swings = [a for _, a, _ in combined]
        winter_swings = [w for _, _, w in combined]

        fig = go.Figure()
        fig.add_trace(go.Bar(
            y=comb_labels, x=annual_swings, orientation="h",
            name="Annual", marker=dict(color=TEAL, opacity=0.85),
            text=[f"{v:.1f}%" for v in annual_swings],
            textposition="outside", textfont=dict(size=9),
            hovertemplate="<b>%{y}</b><br>Annual swing: %{x:.1f}%<extra></extra>",
        ))
        fig.add_trace(go.Bar(
            y=comb_labels, x=winter_swings, orientation="h",
            name="Winter (Oct–Mar)", marker=dict(color=NAVY, opacity=0.85),
            text=[f"{v:.1f}%" for v in winter_swings],
            textposition="outside", textfont=dict(size=9),
            hovertemplate="<b>%{y}</b><br>Winter swing: %{x:.1f}%<extra></extra>",
        ))
        fig.update_layout(
            title=dict(text="Seasonal Comparison — Max % Swing",
                       font=dict(size=13, color="#1a1a2e")),
            xaxis=dict(title="Max Absolute % Change from Baseline", gridcolor=GRID),
            yaxis=dict(title=""),
            barmode="group",
            height=max(420, 36 * len(combined)),
            margin=dict(l=10, r=80, t=50, b=40),
            plot_bgcolor=BG, paper_bgcolor=BG,
            showlegend=True,
            legend=dict(orientation="h", y=-0.12, x=0.5, xanchor="center",
                        font=dict(size=10)),
        )
        st.plotly_chart(fig, key="re_seasonal", use_container_width=True)

        # Highlight biggest seasonal difference
        biggest_diff = max(combined, key=lambda x: abs(x[2] - x[1]))
        diff_name = labels.get(biggest_diff[0], biggest_diff[0])
        st.warning(
            f"⚠️ **{diff_name}** jumps from **{biggest_diff[1]:.0f}%** annual impact "
            f"to **{biggest_diff[2]:.0f}%** in winter — a **{abs(biggest_diff[2] - biggest_diff[1]):.0f} "
            f"percentage-point** increase. If winter self-sufficiency matters, "
            f"get accurate data for this parameter."
        )

    # ══════════════════════════════════════════════════════════════════
    # TAB 4 — UNCERTAINTY WATERFALL
    # ══════════════════════════════════════════════════════════════════
    with tab4:
        st.info(
            "**Uncertainty Waterfall:** Cumulative build-up of uncertainty. "
            "Each bar adds one parameter's maximum % swing on top of "
            "the previous ones. The total represents the worst-case "
            "combined uncertainty in annual PV production. "
            "Largest bars indicate where better data helps most.",
            icon="ℹ️",
        )

        wf_labels = [labels[p] for p, _ in sorted_annual]
        wf_swings = [v[2] for _, v in sorted_annual]

        fig = go.Figure(go.Waterfall(
            x=wf_labels + ["Total"],
            y=wf_swings + [None],
            measure=["relative"] * len(wf_swings) + ["total"],
            text=[f"+{s:.1f}%" for s in wf_swings] + [""],
            textposition="outside",
            textfont=dict(size=10),
            connector=dict(line=dict(color="#d1d5db", width=1)),
            increasing=dict(marker=dict(color=CORAL)),
            totals=dict(marker=dict(color=NAVY)),
            hovertemplate="<b>%{x}</b><br>± %{y:.1f}% swing<extra></extra>",
        ))
        fig.update_layout(
            title=dict(text="Cumulative Uncertainty Build-up — Annual Production",
                       font=dict(size=13, color="#1a1a2e")),
            yaxis=dict(title="Cumulative Max Swing (%)", gridcolor=GRID),
            xaxis=dict(title=""),
            height=max(400, 30 * len(wf_labels) + 100),
            margin=dict(l=10, r=10, t=50, b=130),
            plot_bgcolor=BG, paper_bgcolor=BG,
        )
        fig.update_xaxes(tickangle=-35)
        st.plotly_chart(fig, key="re_waterfall_pv", use_container_width=True)

        top3_total = sum(v[2] for _, v in sorted_annual[:3])
        all_total  = sum(v[2] for _, v in sorted_annual)
        top3_share = top3_total / all_total * 100 if all_total else 0
        st.info(
            f"💡 **The top 3 parameters ({', '.join(top3)}) account for "
            f"{top3_share:.0f}% of total uncertainty.** "
            f"Focus your data collection on these first."
        )

    # ══════════════════════════════════════════════════════════════════
    # TAB 5 — STAKEHOLDER GUIDE (priority cards)
    # ══════════════════════════════════════════════════════════════════
    with tab5:
        st.info(
            "**Stakeholder Guide:** Plain-language summary of each "
            "parameter's importance for your solar PV project, ranked "
            "by impact tier (Critical → Low). Use this to prioritise "
            "data collection efforts.",
            icon="ℹ️",
        )

        for rank, (param, vals) in enumerate(sorted_annual, 1):
            swing = vals[2]
            lbl = labels.get(param, param)
            desc = SOLAR_PV_DESCRIPTIONS.get(param, "")

            # Winter comparison
            w_swing = SOLAR_PV_OAT_WINTER.get(param, (0, 0, 0))[2]
            winter_note = ""
            if w_swing > swing * 1.3:
                winter_note = f"  ·  ❄️ Winter: ±{w_swing:.0f}%"

            if swing >= 20:
                tbg, tbd, tc, icon, tier = (
                    "rgba(255,107,107,0.07)", "rgba(255,107,107,0.25)",
                    "#dc2626", "🔴", "Critical"
                )
            elif swing >= 10:
                tbg, tbd, tc, icon, tier = (
                    "rgba(245,158,11,0.07)", "rgba(245,158,11,0.25)",
                    "#d97706", "🟡", "Important"
                )
            elif swing >= 4:
                tbg, tbd, tc, icon, tier = (
                    "rgba(51,82,138,0.07)", "rgba(51,82,138,0.25)",
                    "#33528A", "🔵", "Moderate"
                )
            else:
                tbg, tbd, tc, icon, tier = (
                    "rgba(148,163,184,0.07)", "rgba(148,163,184,0.25)",
                    "#94a3b8", "⚪", "Low"
                )

            st.markdown(
                f"<div style='background:{tbg}; border:1px solid {tbd}; "
                f"border-radius:10px; padding:11px 15px; margin-bottom:7px;'>"
                f"<div style='display:flex; justify-content:space-between; "
                f"align-items:center; flex-wrap:wrap;'>"
                f"<span style='font-weight:600; font-size:0.93rem; color:#1e293b;'>"
                f"#{rank}  {lbl}</span>"
                f"<span style='background:{tbg}; border:1px solid {tbd}; "
                f"border-radius:16px; padding:2px 10px; font-size:0.72rem; "
                f"color:{tc}; font-weight:600;'>"
                f"{icon} {tier}  ·  ±{swing:.1f}%{winter_note}</span>"
                f"</div>"
                f"<div style='font-size:0.8rem; color:#475569; margin-top:3px;'>"
                f"{desc}</div></div>",
                unsafe_allow_html=True,
            )

        st.markdown(
            "<hr style='margin:14px 0; border:none; border-top:1px solid #e2e8f0;'>",
            unsafe_allow_html=True,
        )
        st.markdown(
            "**🔑 Key take-away:** "
            f"The top 3 parameters — **{top3[0]}**, **{top3[1]}**, "
            f"and **{top3[2]}** — dominate PV production uncertainty. "
            f"Get accurate data for these first. Parameters ranked "
            f"*Low* or *Moderate* can safely use default estimates "
            f"without significantly affecting reliability."
        )


# ============================================================================
# TWO-COLUMN LAYOUT
# ============================================================================
@st.dialog("Sensitivity Analysis — Heating & Renovation", width="large")
def show_renovation_sensitivity():
    """OAT sensitivity analysis for Renovation Planning (heating/cooling focus)."""
    import plotly.graph_objects as go

    st.markdown(
        "<style>"
        "div[data-testid='stDialog'] section[data-testid='stVerticalBlockBorderWrapper'] "
        "{overflow-y:auto !important; max-height:82vh !important;}"
        "</style>",
        unsafe_allow_html=True,
    )

    TEAL  = "#33A9A0"
    NAVY  = "#33528A"
    LIME  = "#8AB62E"
    CORAL = "#FF6B6B"
    GREEN = "#22C55E"
    BG    = "rgba(0,0,0,0)"
    GRID  = "rgba(0,0,0,0.06)"

    baseline = BASELINE_HEATING_KWH

    reno_swings = []
    for p_key, p_data in OAT_PARAMETERS.items():
        outputs = p_data["outputs_kwh"]
        if not outputs:
            continue
        min_out = min(outputs)
        max_out = max(outputs)
        delta_low  = round((min_out - baseline) / baseline * 100, 2)
        delta_high = round((max_out - baseline) / baseline * 100, 2)
        max_swing  = max(abs(delta_low), abs(delta_high))
        if max_swing > 0.1:
            reno_swings.append((p_key, p_data["label"], delta_low, delta_high, max_swing))
    reno_swings.sort(key=lambda x: x[4], reverse=True)
    rtop3 = [s[1] for s in reno_swings[:3]]

    st.markdown(
        "<p style='color:#64748b; font-size:0.86rem; margin-bottom:0.2rem;'>"
        "Results from One-At-a-Time (OAT) analysis on a reference building energy model "
        "(Swedish climate, heating focus). Shows which building parameters most affect "
        "annual heating demand and therefore renovation priorities.</p>",
        unsafe_allow_html=True,
    )

    _rcard = (
        "<div style='background:{bg}; border-radius:10px; padding:10px 12px; "
        "text-align:center; border:1px solid {bd};'>"
        "<div style='font-size:1.25rem; font-weight:700; color:{c};'>{v}</div>"
        "<div style='font-size:0.7rem; color:#64748b; margin-top:2px;'>{l}</div>"
        "</div>"
    )
    rc1, rc2, rc3 = st.columns(3)
    rc1.markdown(_rcard.format(
        bg="rgba(51,82,138,0.08)", bd="rgba(51,82,138,0.2)",
        c=NAVY, v=f"±{reno_swings[0][4]:.0f}%", l=f"Top: {reno_swings[0][1]}",
    ), unsafe_allow_html=True)
    rc2.markdown(_rcard.format(
        bg="rgba(255,107,107,0.08)", bd="rgba(255,107,107,0.2)",
        c=CORAL, v=f"{len(reno_swings)}", l="Parameters Tested",
    ), unsafe_allow_html=True)
    rc3.markdown(_rcard.format(
        bg="rgba(138,182,46,0.08)", bd="rgba(138,182,46,0.2)",
        c=LIME, v=rtop3[0], l="Most Critical Parameter",
    ), unsafe_allow_html=True)

    st.markdown("<div style='height:10px'></div>", unsafe_allow_html=True)

    rtab1, rtab2, rtab3 = st.tabs(["Impact Butterfly", "Parameter Ranking", "Stakeholder Guide"])

    with rtab1:
        st.info(
            "**Impact Butterfly (OAT):** Each parameter varied one-at-a-time from its low to high bound "
            "while all others stay at baseline. Bars to the *left* show heating demand *decrease* "
            "(beneficial for renovation). Bars to the *right* show heating demand *increase*. "
            "Long bars = high impact on energy performance.",
            icon="ℹ️",
        )
        ry_labels  = [s[1] for s in reversed(reno_swings)]
        rlow_vals  = [s[2] for s in reversed(reno_swings)]
        rhigh_vals = [s[3] for s in reversed(reno_swings)]

        rfig = go.Figure()
        rfig.add_trace(go.Bar(
            y=ry_labels, x=rlow_vals, orientation="h",
            name="Low → Baseline",
            marker=dict(color=[GREEN if v < 0 else CORAL for v in rlow_vals], line=dict(width=0)),
            hovertemplate="<b>%{y}</b><br>Low scenario: %{x:+.1f}%<extra></extra>",
            text=[f"{v:+.1f}%" for v in rlow_vals],
            textposition="outside", textfont=dict(size=9),
        ))
        rfig.add_trace(go.Bar(
            y=ry_labels, x=rhigh_vals, orientation="h",
            name="Baseline → High",
            marker=dict(color=[CORAL if v > 0 else GREEN for v in rhigh_vals], line=dict(width=0)),
            hovertemplate="<b>%{y}</b><br>High scenario: %{x:+.1f}%<extra></extra>",
            text=[f"{v:+.1f}%" for v in rhigh_vals],
            textposition="outside", textfont=dict(size=9),
        ))
        rfig.add_vline(x=0, line=dict(color="#475569", width=1.5))
        rfig.update_layout(
            title=dict(text="OAT Butterfly — Annual Heating Demand (% change from baseline)",
                       font=dict(size=13, color="#1a1a2e")),
            xaxis=dict(title="Change in Annual Heating Demand (%)", gridcolor=GRID, zeroline=False),
            yaxis=dict(title=""),
            barmode="overlay",
            height=max(400, 38 * len(reno_swings)),
            margin=dict(l=10, r=80, t=50, b=40),
            plot_bgcolor=BG, paper_bgcolor=BG,
            showlegend=True,
            legend=dict(orientation="h", y=-0.12, x=0.5, xanchor="center", font=dict(size=10)),
        )
        st.plotly_chart(rfig, key="reno_butterfly", use_container_width=True)
        st.info(
            f"🦋 **Key insight:** *{rtop3[0]}* has the largest impact on heating demand. "
            f"Improving this parameter alone can reduce heating by up to "
            f"**{abs(reno_swings[0][2]):.0f}%**. Prioritise accurate data for the top-ranked "
            f"parameters before finalising the renovation plan."
        )

    with rtab2:
        st.info(
            "**Parameter Ranking:** Sorted by maximum absolute swing in annual heating demand. "
            "High-ranking parameters should be prioritised for data collection and renovation investment.",
            icon="ℹ️",
        )
        r_rank = 0
        for p_key, lbl, d_low, d_high, swing in reno_swings:
            r_rank += 1
            if swing >= 30:
                tbg = "rgba(255,107,107,0.07)"; tbd = "rgba(255,107,107,0.25)"
                tc = "#FF6B6B"; r_icon = "🔴"; tier = "High"
            elif swing >= 10:
                tbg = "rgba(51,82,138,0.07)"; tbd = "rgba(51,82,138,0.25)"
                tc = "#33528A"; r_icon = "🔵"; tier = "Moderate"
            else:
                tbg = "rgba(148,163,184,0.07)"; tbd = "rgba(148,163,184,0.25)"
                tc = "#94a3b8"; r_icon = "⚪"; tier = "Low"
            dir_note = f"↓{abs(d_low):.1f}% / ↑{d_high:.1f}%" if d_low < 0 and d_high > 0 else f"range: {d_low:+.1f}% to {d_high:+.1f}%"
            st.markdown(
                f"<div style='background:{tbg}; border:1px solid {tbd}; "
                f"border-radius:10px; padding:11px 15px; margin-bottom:7px;'>"
                f"<div style='display:flex; justify-content:space-between; align-items:center;'>"
                f"<span style='font-weight:600; font-size:0.93rem; color:#1e293b;'>#{r_rank}  {lbl}</span>"
                f"<span style='background:{tbg}; border:1px solid {tbd}; border-radius:16px; "
                f"padding:2px 10px; font-size:0.72rem; color:{tc}; font-weight:600;'>"
                f"{r_icon} {tier}  ·  {dir_note}</span>"
                f"</div></div>",
                unsafe_allow_html=True,
            )

    with rtab3:
        st.markdown("**🏗️ Which parameters matter most for your renovation?**")
        _reno_guide = [
            ("Infiltration Rate", "🔴 High", "#FF6B6B",
             "Air leakage through the building envelope is often the largest driver of heating loss. "
             "Prioritise airtightness testing (blower door) before and after renovation."),
            ("Construction Quality", "🔴 High", "#FF6B6B",
             "Wall, roof and floor insulation package determines baseline heat loss. "
             "Upgrading poorly insulated envelopes delivers the largest heating reductions."),
            ("Heating Setpoint", "🔴 High", "#FF6B6B",
             "Every degree of setpoint reduction cuts heating by roughly 10–15%. "
             "Smart controls and occupant behaviour can be as impactful as physical renovation."),
            ("Roof Shape & Pitch", "🔴 High", "#FF6B6B",
             "Roof geometry affects heat loss area and solar gain / PV potential. "
             "Document accurately from surveys or laser scan."),
            ("Number of Floors", "🟡 Moderate", "#8AB62E",
             "Building volume and surface-to-volume ratio scale with floor count. "
             "Correct floor count from EPC or site survey improves model accuracy significantly."),
            ("Building Footprint", "🟡 Moderate", "#8AB62E",
             "Length and width affect total external wall area. Use GIS or architectural drawings."),
            ("Window-to-Wall Ratio", "🟡 Moderate", "#8AB62E",
             "Glazing area is a key heat loss pathway and solar gain source. "
             "Minimise north-facing glazing; south-facing can be beneficial."),
            ("Glazing Quality", "🔵 Low–Medium", "#33528A",
             "Window U-value and g-value. Triple glazing has diminishing returns beyond a point. "
             "Prioritise frame air-sealing before expensive glazing upgrades."),
        ]
        for rg_name, rg_tier, rg_color, rg_desc in _reno_guide:
            st.markdown(
                f"<div style='background:rgba(0,0,0,0.02); border-left:3px solid {rg_color}; "
                f"padding:10px 14px; margin-bottom:8px; border-radius:0 8px 8px 0;'>"
                f"<b>{rg_name}</b> <span style='color:{rg_color}; font-size:0.78rem; font-weight:600;'>{rg_tier}</span>"
                f"<div style='font-size:0.82rem; color:#475569; margin-top:4px;'>{rg_desc}</div>"
                f"</div>",
                unsafe_allow_html=True,
            )
        st.markdown(
            "<hr style='margin:14px 0; border:none; border-top:1px solid #e2e8f0;'>",
            unsafe_allow_html=True,
        )
        st.markdown(
            "**🔑 Key take-away:** "
            f"The top 3 parameters — **{rtop3[0]}**, **{rtop3[1]}**, "
            f"and **{rtop3[2]}** — dominate heating demand uncertainty. "
            "Get accurate data for these first. Parameters ranked *Low* "
            "can safely use proxy estimates without significantly affecting the result."
        )


@st.dialog("Sensitivity Analysis — Energy Community", width="large")
def show_ec_sensitivity():
    """OAT sensitivity for Energy Community Planning — building energy baseline."""
    import plotly.graph_objects as go

    st.markdown(
        "<style>"
        "div[data-testid='stDialog'] section[data-testid='stVerticalBlockBorderWrapper'] "
        "{overflow-y:auto !important; max-height:82vh !important;}"
        "</style>",
        unsafe_allow_html=True,
    )

    TEAL  = "#33A9A0"
    NAVY  = "#33528A"
    LIME  = "#8AB62E"
    CORAL = "#FF6B6B"
    GREEN = "#22C55E"
    BG    = "rgba(0,0,0,0)"
    GRID  = "rgba(0,0,0,0.06)"

    baseline = BASELINE_HEATING_KWH

    ec_swings = []
    for p_key, p_data in OAT_PARAMETERS.items():
        outputs = p_data["outputs_kwh"]
        if not outputs:
            continue
        min_out = min(outputs)
        max_out = max(outputs)
        delta_low  = round((min_out - baseline) / baseline * 100, 2)
        delta_high = round((max_out - baseline) / baseline * 100, 2)
        max_swing  = max(abs(delta_low), abs(delta_high))
        if max_swing > 0.1:
            ec_swings.append((p_key, p_data["label"], delta_low, delta_high, max_swing))
    ec_swings.sort(key=lambda x: x[4], reverse=True)
    etop3 = [s[1] for s in ec_swings[:3]]

    st.markdown(
        "<p style='color:#64748b; font-size:0.86rem; margin-bottom:0.2rem;'>"
        "Results from OAT analysis on a reference community building (Swedish climate). "
        "In an energy community, individual building parameters drive collective demand, "
        "self-consumption and sharing potential. Understanding which parameters matter most "
        "helps prioritise data collection across all community members.</p>",
        unsafe_allow_html=True,
    )

    _ecard = (
        "<div style='background:{bg}; border-radius:10px; padding:10px 12px; "
        "text-align:center; border:1px solid {bd};'>"
        "<div style='font-size:1.25rem; font-weight:700; color:{c};'>{v}</div>"
        "<div style='font-size:0.7rem; color:#64748b; margin-top:2px;'>{l}</div>"
        "</div>"
    )
    ec2, ec3, ec4 = st.columns(3)
    ec2.markdown(_ecard.format(
        bg="rgba(51,82,138,0.08)", bd="rgba(51,82,138,0.2)",
        c=NAVY, v=f"±{ec_swings[0][4]:.0f}%", l=f"Top: {ec_swings[0][1]}",
    ), unsafe_allow_html=True)
    ec3.markdown(_ecard.format(
        bg="rgba(255,107,107,0.08)", bd="rgba(255,107,107,0.2)",
        c=CORAL, v=f"{len(ec_swings)}", l="Parameters Tested",
    ), unsafe_allow_html=True)
    ec4.markdown(_ecard.format(
        bg="rgba(138,182,46,0.08)", bd="rgba(138,182,46,0.2)",
        c=LIME, v=etop3[0], l="Most Critical Parameter",
    ), unsafe_allow_html=True)

    st.markdown("<div style='height:10px'></div>", unsafe_allow_html=True)

    etab1, etab2, etab3 = st.tabs(["Impact Butterfly", "Parameter Ranking", "Community Guide"])

    with etab1:
        st.info(
            "**Impact Butterfly (OAT):** Each building parameter is varied independently. "
            "In a community context these effects multiply across all member buildings — "
            "a ±20% swing per building translates directly to community-level demand uncertainty "
            "and affects self-sufficiency and sharing calculations.",
            icon="ℹ️",
        )
        ey_labels  = [s[1] for s in reversed(ec_swings)]
        elow_vals  = [s[2] for s in reversed(ec_swings)]
        ehigh_vals = [s[3] for s in reversed(ec_swings)]

        efig = go.Figure()
        efig.add_trace(go.Bar(
            y=ey_labels, x=elow_vals, orientation="h",
            name="Low → Baseline",
            marker=dict(color=[GREEN if v < 0 else CORAL for v in elow_vals], line=dict(width=0)),
            hovertemplate="<b>%{y}</b><br>Low scenario: %{x:+.1f}%<extra></extra>",
            text=[f"{v:+.1f}%" for v in elow_vals],
            textposition="outside", textfont=dict(size=9),
        ))
        efig.add_trace(go.Bar(
            y=ey_labels, x=ehigh_vals, orientation="h",
            name="Baseline → High",
            marker=dict(color=[CORAL if v > 0 else GREEN for v in ehigh_vals], line=dict(width=0)),
            hovertemplate="<b>%{y}</b><br>High scenario: %{x:+.1f}%<extra></extra>",
            text=[f"{v:+.1f}%" for v in ehigh_vals],
            textposition="outside", textfont=dict(size=9),
        ))
        efig.add_vline(x=0, line=dict(color="#475569", width=1.5))
        efig.update_layout(
            title=dict(text="OAT Butterfly — Annual Heating Demand per Building (% change from baseline)",
                       font=dict(size=13, color="#1a1a2e")),
            xaxis=dict(title="Change in Annual Heating Demand (%)", gridcolor=GRID, zeroline=False),
            yaxis=dict(title=""),
            barmode="overlay",
            height=max(400, 38 * len(ec_swings)),
            margin=dict(l=10, r=80, t=50, b=40),
            plot_bgcolor=BG, paper_bgcolor=BG,
            showlegend=True,
            legend=dict(orientation="h", y=-0.12, x=0.5, xanchor="center", font=dict(size=10)),
        )
        st.plotly_chart(efig, key="ec_butterfly", use_container_width=True)
        st.info(
            f"🦋 **Community insight:** *{etop3[0]}* has the largest per-building impact. "
            f"Across a 10-building community, this alone can create a ±{abs(ec_swings[0][2]):.0f}% "
            f"variance in total heating demand — directly affecting sizing and financial viability."
        )

    with etab2:
        st.info(
            "**Parameter Ranking:** Sorted by maximum absolute swing in annual heating demand. "
            "Collect data for high-ranked parameters across all community member buildings.",
            icon="ℹ️",
        )
        e_rank = 0
        for p_key, lbl, d_low, d_high, swing in ec_swings:
            e_rank += 1
            if swing >= 30:
                tbg = "rgba(255,107,107,0.07)"; tbd = "rgba(255,107,107,0.25)"
                tc = "#FF6B6B"; e_icon = "🔴"; tier = "High"
            elif swing >= 10:
                tbg = "rgba(51,82,138,0.07)"; tbd = "rgba(51,82,138,0.25)"
                tc = "#33528A"; e_icon = "🔵"; tier = "Moderate"
            else:
                tbg = "rgba(148,163,184,0.07)"; tbd = "rgba(148,163,184,0.25)"
                tc = "#94a3b8"; e_icon = "⚪"; tier = "Low"
            dir_note = f"↓{abs(d_low):.1f}% / ↑{d_high:.1f}%" if d_low < 0 and d_high > 0 else f"range: {d_low:+.1f}% to {d_high:+.1f}%"
            st.markdown(
                f"<div style='background:{tbg}; border:1px solid {tbd}; "
                f"border-radius:10px; padding:11px 15px; margin-bottom:7px;'>"
                f"<div style='display:flex; justify-content:space-between; align-items:center;'>"
                f"<span style='font-weight:600; font-size:0.93rem; color:#1e293b;'>#{e_rank}  {lbl}</span>"
                f"<span style='background:{tbg}; border:1px solid {tbd}; border-radius:16px; "
                f"padding:2px 10px; font-size:0.72rem; color:{tc}; font-weight:600;'>"
                f"{e_icon} {tier}  ·  {dir_note}</span>"
                f"</div></div>",
                unsafe_allow_html=True,
            )

    with etab3:
        st.markdown("**🏘️ How building parameters affect community energy planning**")
        _ec_guide = [
            ("Infiltration Rate", "🔴 High community impact", "#FF6B6B",
             "Air leakage varies widely across a community — older buildings often have 3–5× higher rates. "
             "Poor envelope airtightness inflates community demand baseline and undermines self-sufficiency."),
            ("Construction Quality", "🔴 High community impact", "#FF6B6B",
             "Mixed construction vintages (e.g. 1960s vs 2000s) create demand heterogeneity. "
             "Knowing each building's insulation profile enables targeted flexible demand strategies."),
            ("Heating Setpoint", "🔴 High community impact", "#FF6B6B",
             "Setpoint diversity enables demand-response: shifting setpoints ±1°C across buildings "
             "can provide significant flexibility without comfort impact."),
            ("Roof Shape & Pitch", "🔴 High — affects PV potential", "#FF6B6B",
             "In communities with shared PV, roof geometry determines available panel area. "
             "Document from EPC, LiDAR, or aerial imagery for accurate production sizing."),
            ("Number of Floors", "🟡 Moderate community impact", "#8AB62E",
             "Affects individual building demand which sums to community total. EPC or cadastre provides this."),
            ("Building Footprint", "🟡 Moderate", "#8AB62E",
             "Sets envelope area and volume. Available from GIS/cadastre for community-scale modelling."),
            ("Window-to-Wall Ratio", "🟡 Moderate", "#8AB62E",
             "Affects solar gain diversity across community buildings. South-facing glazing helps in winter."),
        ]
        for eg_name, eg_tier, eg_color, eg_desc in _ec_guide:
            st.markdown(
                f"<div style='background:rgba(0,0,0,0.02); border-left:3px solid {eg_color}; "
                f"padding:10px 14px; margin-bottom:8px; border-radius:0 8px 8px 0;'>"
                f"<b>{eg_name}</b> <span style='color:{eg_color}; font-size:0.78rem; font-weight:600;'>{eg_tier}</span>"
                f"<div style='font-size:0.82rem; color:#475569; margin-top:4px;'>{eg_desc}</div>"
                f"</div>",
                unsafe_allow_html=True,
            )
        st.markdown(
            "<hr style='margin:14px 0; border:none; border-top:1px solid #e2e8f0;'>",
            unsafe_allow_html=True,
        )
        st.markdown(
            "**🔑 Key take-away for Energy Communities:** "
            f"Collect accurate data for **{etop3[0]}**, **{etop3[1]}**, and **{etop3[2]}** "
            "across all buildings in the community. These parameters dominate collective "
            "demand uncertainty, directly affecting sharing potential, self-sufficiency, "
            "and grid interaction calculations."
        )



_is_reno_planning = (project_type == "Renovation Planning")

if not _is_reno_planning:
    all_items = []
    for sys_group in data_inputs:
        for cat in sys_group["categories"]:
            all_items.extend(cat["items"])

    # Stats
    avail = miss = 0
    confs = []
    for it in all_items:
        hk = f"{page_key}_{it['key']}_has"
        if st.session_state.get(hk, "Yes") == "Yes":
            avail += 1
        else:
            miss += 1
            pk = f"{page_key}_{it['key']}_proxy"
            sp = st.session_state.get(pk)
            if sp:
                ci = get_proxy_confidence(country, it["key"], sp)
                cv = ci.get("confidence")
                if cv is not None:
                    confs.append(cv)
    avg_conf = round(sum(confs) / len(confs), 1) if confs else None
    avg_display = f"{avg_conf}%" if avg_conf else "N/A"
    _total_items = avail + miss

    # Coverage summary header
    st.markdown(
        "<div style='font-size:1.05rem; font-weight:700; color:#0f172a; "
        "margin:0.5rem 0 0.3rem 0;'>📋 Data Input Coverage</div>",
        unsafe_allow_html=True,
    )
    st.caption(
        f"Your project requires **{_total_items} data inputs**. "
        f"Tell us what you already have — we'll configure the workflow for what's missing."
    )

    render_top_cards([
            {
                    "value": str(avail),
                    "label": "Available Data",
                    "color": "#33A9A0",
                    "bg": "rgba(51,169,160,0.10)",
                    "border": "rgba(51,169,160,0.25)",
            },
            {
                    "value": str(miss),
                    "label": "Missing Data",
                    "color": "#33528A",
                    "bg": "rgba(51,82,138,0.10)",
                    "border": "rgba(51,82,138,0.25)",
            },
            {
                    "value": avg_display,
                    "label": "Avg. Proxy Confidence",
                    "color": "#8AB62E",
                    "bg": "rgba(138,182,46,0.10)",
                    "border": "rgba(138,182,46,0.25)",
            },
    ])

# ── Sensitivity Analysis banner — above both columns, always visible ──────────
# ── Sensitivity Analysis banner — visible for all three project types ─────────
_SA_INFO = {
    "Renewable Energy Planning": (
        "⚡ Sensitivity Analysis Available",
        "Inspect Solar PV parameter impact, OAT butterfly, Morris screening, seasonal comparison and uncertainty waterfall.",
        "rgba(196,232,29,0.55)",
        "linear-gradient(120deg, rgba(196,232,29,0.18) 0%, rgba(51,169,160,0.13) 100%)",
        "#597001", "rgba(89,112,1,0.13)",
    ),
    "Renovation Planning": (
        "🏗️ Sensitivity Analysis Available",
        "Inspect building envelope parameter impact on heating demand, OAT butterfly, parameter ranking and renovation priorities.",
        "rgba(51,82,138,0.40)",
        "linear-gradient(120deg, rgba(51,82,138,0.12) 0%, rgba(51,169,160,0.10) 100%)",
        "#33528A", "rgba(51,82,138,0.12)",
    ),
    "Energy Community Planning": (
        "🏘️ Sensitivity Analysis Available",
        "Inspect community building parameter impact on heating demand, sensitivity ranking and community-level energy planning guide.",
        "rgba(51,169,160,0.40)",
        "linear-gradient(120deg, rgba(51,169,160,0.15) 0%, rgba(138,182,46,0.12) 100%)",
        "#0f766e", "rgba(51,169,160,0.12)",
    ),
}
_sa = _SA_INFO.get(project_type)
if _sa:
    _sa_title, _sa_desc, _sa_border, _sa_bg, _sa_tc, _sa_shadow = _sa
    sa_col, sa_btn_col = st.columns([0.78, 0.22])
    with sa_col:
        st.markdown(
            f"""
            <div style='border:1px solid {_sa_border}; border-radius:14px; padding:0.78rem 1rem;
                        background:{_sa_bg};
                        box-shadow:0 4px 18px {_sa_shadow}; margin-bottom:0.1rem;'>
                <div style='font-size:0.75rem; font-weight:800; color:{_sa_tc}; text-transform:uppercase; letter-spacing:0.09em;'>{_sa_title}</div>
                <div style='font-size:0.9rem; color:#33528A; margin-top:0.22rem; font-weight:500;'>
                    {_sa_desc}
                </div>
            </div>
            """,
            unsafe_allow_html=True,
        )
    with sa_btn_col:
        st.markdown("<div style='height:0.55rem;'></div>", unsafe_allow_html=True)
        if st.button(
            "Open Analysis",
            key="sa2p_dialog_btn",
            type="primary",
            use_container_width=True,
            help="View sensitivity analysis results",
        ):
            if project_type == "Renewable Energy Planning":
                show_re_sensitivity()
            elif project_type == "Renovation Planning":
                show_renovation_sensitivity()
            elif project_type == "Energy Community Planning":
                show_ec_sensitivity()

if project_type == "Renovation Planning":
    # ================================================================
    # RENOVATION PLANNING — PROJECT CONFIGURATION VIEW
    # ================================================================
    # 1. Compact building selector
    # 2. Assess coverage from EPC + TABULA
    # 3. Summary cards (covered / synthetic / missing / confidence)
    # 4. Grouped coverage list
    # 5. Workflow assessment (what we do about gaps)
    # 6. Expander: map + passport + TABULA details (behind button)

    _reno_passport = {}
    _reno_tabula_match = None
    _reno_tabula_conf = None
    _reno_climate_zone = 3
    _reno_selected_row = None
    _reno_map_center = None
    _reno_linked_points = None

    if has_location_database():
        project_scale = st.session_state.get("project_scale", "")
        sel = st.session_state.get("location_selection", {})

        # Re-geocode if needed
        if isinstance(sel, dict) and sel.get("mode") == "address":
            typed_addr = (st.session_state.get("location") or "").strip()
            selected_query = str(sel.get("query") or "").strip()
            if typed_addr and typed_addr != selected_query:
                try:
                    geocoded = geocode_address(typed_addr, st.session_state.get("country", "Sweden"))
                    if geocoded:
                        lat = float(geocoded["lat"])
                        lon = float(geocoded["lon"])
                        st.session_state["project_lat"] = lat
                        st.session_state["project_lon"] = lon
                        st.session_state["project_location_label"] = geocoded.get("display_name", typed_addr)
                        st.session_state["location_selection"] = {
                            "mode": "address", "query": typed_addr,
                            "label": st.session_state["project_location_label"],
                            "lat": lat, "lon": lon,
                            "radius_m": 80 if project_scale == "Building" else int(st.session_state.get("location_radius_m", 800)),
                        }
                        sel = st.session_state.get("location_selection", {})
                except Exception:
                    pass

        selection_mode = "Address + Radius"
        if isinstance(sel, dict) and sel.get("mode") == "bbox":
            selection_mode = "Draw Bounding Box"
        elif isinstance(sel, dict) and sel.get("mode") == "address":
            selection_mode = "Address + Radius"
        else:
            selection_mode = st.session_state.get("p1p_location_mode", "Address + Radius")
        if project_scale == "Building":
            selection_mode = "Address + Radius"

        snapshot = None
        location_label = st.session_state.get("project_location_label", st.session_state.get("location", "Selected location"))
        map_center_lat = map_center_lon = None
        location_note = ""

        # Resolve snapshot (same logic as right_col)
        if selection_mode == "Draw Bounding Box" and isinstance(sel, dict) and sel.get("bbox"):
            b = sel["bbox"]
            snapshot = get_epc_snapshot_for_bbox(b["min_lat"], b["max_lat"], b["min_lon"], b["max_lon"], point_limit=1200)
            map_center_lat = (b["min_lat"] + b["max_lat"]) / 2
            map_center_lon = (b["min_lon"] + b["max_lon"]) / 2
            location_note = f"Bounding box"
        elif selection_mode == "Address + Radius" and isinstance(sel, dict) and sel.get("lat") is not None:
            lat = float(sel["lat"])
            lon = float(sel["lon"])
            if project_scale == "Building":
                snapshot = get_nearby_epc_snapshot(lat, lon, radius_m=250, point_limit=300)
                addr_query = sel.get("query") or st.session_state.get("location") or location_label
                snapshot, chosen_addr, matched_by_query = _prepare_single_building_snapshot(snapshot, addr_query)
                location_note = f"{location_label}"
            else:
                radius = int(sel.get("radius_m", st.session_state.get("location_radius_m", 800)))
                snapshot = get_nearby_epc_snapshot(lat, lon, radius_m=radius, point_limit=1000)
                location_note = f"{location_label} · radius {radius} m"
            map_center_lat = lat
            map_center_lon = lon
        elif "project_lat" in st.session_state and "project_lon" in st.session_state:
            lat = float(st.session_state["project_lat"])
            lon = float(st.session_state["project_lon"])
            if project_scale == "Building":
                snapshot = get_nearby_epc_snapshot(lat, lon, radius_m=250, point_limit=300)
                addr_query = st.session_state.get("location") or location_label
                snapshot, chosen_addr, matched_by_query = _prepare_single_building_snapshot(snapshot, addr_query)
                location_note = f"{location_label}"
            else:
                radius = int(st.session_state.get("location_radius_m", 800))
                snapshot = get_nearby_epc_snapshot(lat, lon, radius_m=radius, point_limit=1000)
                location_note = f"{location_label} · radius {radius} m"
            map_center_lat = lat
            map_center_lon = lon

        # Map + building selector
        if snapshot is not None and map_center_lat is not None:
            points_df = snapshot["points"]
            linked_points_df = points_df[
                ~points_df["FormularId"].isna()
                & (points_df["address"].notna() | points_df["energy_class"].notna()
                   | points_df["energy_performance"].notna() | points_df["build_year"].notna()
                   | points_df["atemp"].notna())
            ].copy() if not points_df.empty else points_df
            if not linked_points_df.empty:
                linked_points_df = linked_points_df.drop_duplicates(subset=["FormularId"], keep="first")

            # Store map data for rendering in the details expander later
            _reno_map_center = (map_center_lat, map_center_lon)
            _reno_linked_points = linked_points_df

            if not linked_points_df.empty:
                st.markdown(
                    f"<div style='font-size:0.82rem; color:#64748b; margin-bottom:0.2rem;'>"
                    f"📍 {location_note} · {len(linked_points_df)} EPC-linked building{'s' if len(linked_points_df) != 1 else ''}</div>",
                    unsafe_allow_html=True,
                )
                points_with_id = linked_points_df.copy()
                points_with_id["_label"] = points_with_id.apply(
                    lambda r: (
                        (r["address"] if isinstance(r.get("address"), str) and r.get("address") else "Address unavailable")
                        + (f" · EPC {_display_value(r.get('energy_class'))}" if not _is_missing(r.get("energy_class")) else "")
                    ),
                    axis=1,
                )
                options = points_with_id["_label"].tolist()[:300]
                chosen = st.selectbox("Select building", options=options, key="s2p_reno_building")
                _reno_selected_row = points_with_id[points_with_id["_label"] == chosen].iloc[0]
                st.session_state["s2p_selected_formular_id"] = _safe_id_text(_reno_selected_row.get("FormularId"))

                _reno_passport = get_epc_building_passport(_reno_selected_row.get("FormularId")) or {}

                # TABULA matching
                _epc_build_year = _reno_passport.get("EgenNybyggAr", _reno_selected_row.get("build_year"))
                _epc_btype_raw = _reno_passport.get("EgenByggnadsTyp") or _reno_passport.get("EgenByggnadsKat") or ""
                _epc_kommun = _reno_passport.get("IdKommun", _reno_selected_row.get("municipality")) or ""

                _build_year_num = None
                if _epc_build_year is not None:
                    try:
                        _build_year_num = int(float(str(_epc_build_year)))
                    except (ValueError, TypeError):
                        pass

                _reno_climate_zone = climate_zone_from_county(_epc_kommun)
                if _reno_climate_zone is None:
                    _lat = float(_reno_selected_row.get("lat", 0)) if _reno_selected_row.get("lat") else None
                    _reno_climate_zone = climate_zone_from_lat(_lat) if _lat else 3

                if _build_year_num and _epc_btype_raw:
                    _reno_tabula_match = match_archetype(_epc_btype_raw, _build_year_num)
                    _reno_tabula_conf = match_confidence(_epc_btype_raw, _build_year_num)
                elif _build_year_num:
                    for _try_field in ["EgenTypkod_typ", "EgenByggnadsKat"]:
                        _try_val = _reno_passport.get(_try_field, "")
                        if _try_val:
                            _reno_tabula_match = match_archetype(str(_try_val), _build_year_num)
                            _reno_tabula_conf = match_confidence(str(_try_val), _build_year_num)
                            if _reno_tabula_match:
                                break

                st.session_state["tabula_archetype"] = _reno_tabula_match
                st.session_state["tabula_confidence"] = _reno_tabula_conf
                st.session_state["tabula_climate_zone"] = _reno_climate_zone
                st.session_state["epc_passport"] = _reno_passport
            else:
                st.info("No EPC-linked buildings found near this location.")

    # ── Assess data coverage ──────────────────────────────────────
    _coverage = assess_coverage(
        passport=_reno_passport,
        tabula_match=_reno_tabula_match,
        boverket_available=True,
        wikells_available=False,
        envelope_components=reno_envelope,
    )
    _conf_score = compute_confidence_score(_coverage)
    _grouped = group_by_category(_coverage)

    _n_covered = sum(1 for r in _coverage if r["status"] == "covered")
    _n_synthetic = sum(1 for r in _coverage if r["status"] == "available_synthetic")
    _n_missing = sum(1 for r in _coverage if r["status"] == "missing")

    # ── Summary cards ──────────────────────────────────────────────
    st.markdown("<div style='height:0.6rem;'></div>", unsafe_allow_html=True)

    _STATUS_STYLE = {
        "covered": ("#33A9A0", "rgba(51,169,160,0.10)", "rgba(51,169,160,0.25)"),
        "available_synthetic": ("#F59E0B", "rgba(245,158,11,0.10)", "rgba(245,158,11,0.25)"),
        "missing": ("#EF4444", "rgba(239,68,68,0.10)", "rgba(239,68,68,0.25)"),
    }

    render_top_cards([
        {"value": str(_n_covered), "label": "✅ Covered", "color": "#33A9A0",
         "bg": "rgba(51,169,160,0.10)", "border": "rgba(51,169,160,0.25)"},
        {"value": str(_n_synthetic), "label": "🔄 Synthetic Available", "color": "#F59E0B",
         "bg": "rgba(245,158,11,0.10)", "border": "rgba(245,158,11,0.25)"},
        {"value": str(_n_missing), "label": "❌ Missing", "color": "#EF4444",
         "bg": "rgba(239,68,68,0.10)", "border": "rgba(239,68,68,0.25)"},
        {"value": f"{_conf_score}%", "label": "📊 Confidence Score", "color": "#33528A",
         "bg": "rgba(51,82,138,0.10)", "border": "rgba(51,82,138,0.25)"},
    ])

    # ── Grouped coverage list ──────────────────────────────────────
    st.markdown(
        "<div style='font-size:1.05rem; font-weight:700; color:#0f172a; "
        "margin:0.8rem 0 0.3rem 0;'>📋 Data Input Coverage</div>",
        unsafe_allow_html=True,
    )
    st.caption(
        "What we already know about your asset, what can be generated synthetically, "
        "and what you'll need to provide. This drives the workflow in the next steps."
    )

    _SOURCE_BADGE = {
        "EPC": ("#33A9A0", "rgba(51,169,160,0.12)"),
        "TABULA": ("#33528A", "rgba(51,82,138,0.10)"),
        "Boverket": ("#8AB62E", "rgba(138,182,46,0.10)"),
        "Wikells": ("#8B5CF6", "rgba(139,92,246,0.10)"),
        "Synthetic": ("#F59E0B", "rgba(245,158,11,0.10)"),
    }
    _STATUS_ICON = {
        "covered": "✅",
        "available_synthetic": "🔄",
        "missing": "❌",
    }

    for _cat_name, _cat_items in _grouped.items():
        _cat_covered = sum(1 for r in _cat_items if r["status"] == "covered")
        _cat_total = len(_cat_items)
        _pct = int(_cat_covered / _cat_total * 100) if _cat_total else 0
        _bar_color = "#33A9A0" if _pct >= 80 else "#F59E0B" if _pct >= 40 else "#EF4444"

        with st.expander(f"{_cat_name}  —  {_cat_covered}/{_cat_total} covered ({_pct}%)", expanded=(_pct < 100)):
            for _item in _cat_items:
                _icon = _STATUS_ICON.get(_item["status"], "")
                _src = _item["source"]
                _val = _item["value"]

                # Source badge
                _src_html = ""
                if _src and _src in _SOURCE_BADGE:
                    _sc, _sbg = _SOURCE_BADGE[_src]
                    _src_html = (
                        f"<span style='background:{_sbg}; color:{_sc}; "
                        f"padding:1px 8px; border-radius:6px; font-size:0.7rem; "
                        f"font-weight:600; margin-left:6px;'>{_src}</span>"
                    )

                # Value display
                _val_html = ""
                if _val is not None and _item["status"] == "covered":
                    _val_str = str(_val)
                    if len(_val_str) > 40:
                        _val_str = _val_str[:40] + "…"
                    _unit_str = f" {_item['unit']}" if _item["unit"] else ""
                    _val_html = (
                        f"<span style='color:#475569; font-size:0.8rem; margin-left:8px;'>"
                        f"{_val_str}{_unit_str}</span>"
                    )
                elif _item["status"] == "available_synthetic":
                    _val_html = (
                        "<span style='color:#92400e; font-size:0.78rem; margin-left:8px; "
                        "font-style:italic;'>Can be generated synthetically</span>"
                    )

                # Weight indicator
                _w = _item["confidence_weight"]
                _w_dots = "●" * min(_w // 2, 5) + "○" * (5 - min(_w // 2, 5))
                _w_html = (
                    f"<span style='color:#cbd5e1; font-size:0.65rem; margin-left:auto; "
                    f"white-space:nowrap;' title='Impact weight: {_w}/10'>{_w_dots}</span>"
                )

                st.markdown(
                    f"<div style='display:flex; align-items:center; gap:0.3rem; "
                    f"padding:0.35rem 0; border-bottom:1px solid #f1f5f9;'>"
                    f"<span style='font-size:0.85rem;'>{_icon}</span>"
                    f"<span style='font-weight:600; font-size:0.88rem; color:#0f172a;'>"
                    f"{_item['label']}</span>"
                    f"{_src_html}{_val_html}{_w_html}"
                    f"</div>",
                    unsafe_allow_html=True,
                )

    # ── Workflow Assessment ──────────────────────────────────────
    st.markdown(
        "<div style='font-size:1.05rem; font-weight:700; color:#0f172a; "
        "margin:1.2rem 0 0.3rem 0;'>⚙️ Generated Workflow</div>",
        unsafe_allow_html=True,
    )
    st.caption(
        "Based on your data coverage, here's how the platform will handle each gap."
    )

    _workflow_steps = []
    for _item in _coverage:
        if _item["status"] == "covered":
            continue
        if _item["status"] == "available_synthetic":
            _workflow_steps.append({
                "label": _item["label"],
                "action": "Generate synthetic proxy",
                "detail": f"We'll generate a synthetic estimate for **{_item['label']}** using TABULA archetypes and statistical models.",
                "icon": "🔄",
                "color": "#F59E0B",
            })
        elif _item["status"] == "missing":
            _workflow_steps.append({
                "label": _item["label"],
                "action": "User input required",
                "detail": f"**{_item['label']}** is not available from any database. You'll be asked to provide this in the next step.",
                "icon": "📝",
                "color": "#EF4444",
            })

    if _workflow_steps:
        for _ws in _workflow_steps:
            st.markdown(
                f"<div style='display:flex; align-items:flex-start; gap:0.6rem; "
                f"padding:0.5rem 0.7rem; border-left:3px solid {_ws['color']}; "
                f"background:{_ws['color']}08; border-radius:0 10px 10px 0; margin-bottom:0.4rem;'>"
                f"<span style='font-size:1rem;'>{_ws['icon']}</span>"
                f"<div>"
                f"<div style='font-weight:700; font-size:0.88rem; color:#0f172a;'>{_ws['label']}</div>"
                f"<div style='font-size:0.78rem; color:#475569;'>{_ws['action']}</div>"
                f"</div></div>",
                unsafe_allow_html=True,
            )
    else:
        st.success("All required data inputs are covered! No additional input needed.")

    # ── Expander: Full Building Passport + TABULA details ──────────
    with st.expander("🔍 Building Data Sources — EPC & TABULA Details", expanded=False):
        # Map (if available)
        try:
            if _reno_linked_points is not None and not _reno_linked_points.empty:
                fmap = folium.Map(
                    location=[_reno_map_center[0], _reno_map_center[1]],
                    zoom_start=14, tiles="CartoDB positron",
                    control_scale=False, prefer_canvas=True,
                )
                for _, r in _reno_linked_points.head(400).iterrows():
                    tooltip = f"{r.get('address', 'Building')} · EPC {_display_value(r.get('energy_class'))}"
                    folium.CircleMarker(
                        location=[float(r["lat"]), float(r["lon"])],
                        radius=3, weight=1, color="#33A9A0",
                        fill=True, fill_color="#33A9A0", fill_opacity=0.8,
                        tooltip=folium.Tooltip(tooltip, sticky=True),
                    ).add_to(fmap)
                st_folium(fmap, width=None, height=280, key="s2p_reno_map")
        except NameError:
            pass

        if _reno_passport:
            _pp = _reno_passport
            _addr = _display_value(_pp.get("IdAdr", (_reno_selected_row.get("address") if _reno_selected_row is not None else "")))
            _kommun = _display_value(_pp.get("IdKommun", (_reno_selected_row.get("municipality") if _reno_selected_row is not None else "")))
            _eclass = _display_value(_pp.get("EgiEnergiklass"))
            _eperf = _display_value(_pp.get("EgiEnergiPrestanda"))
            _atemp = _display_value(_pp.get("EgenAtemp"), " m²")
            _byear = _display_value(_pp.get("EgenNybyggAr"))
            _nplan = _display_value(_pp.get("EgenAntalPlan"))

            st.markdown(
                f"<div style='display:grid; grid-template-columns:1fr 1fr 1fr; gap:0.5rem;'>"
                f"<div style='background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:0.6rem;'>"
                f"<div style='font-size:0.7rem; color:#64748b;'>Address</div>"
                f"<div style='font-size:0.88rem; font-weight:700;'>{_addr}</div></div>"
                f"<div style='background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:0.6rem;'>"
                f"<div style='font-size:0.7rem; color:#64748b;'>Municipality</div>"
                f"<div style='font-size:0.88rem; font-weight:700;'>{_kommun}</div></div>"
                f"<div style='background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:0.6rem;'>"
                f"<div style='font-size:0.7rem; color:#64748b;'>Energy Class</div>"
                f"<div style='font-size:0.88rem; font-weight:700;'>{_eclass}</div></div>"
                f"<div style='background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:0.6rem;'>"
                f"<div style='font-size:0.7rem; color:#64748b;'>Energy Performance</div>"
                f"<div style='font-size:0.88rem; font-weight:700;'>{_eperf}</div></div>"
                f"<div style='background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:0.6rem;'>"
                f"<div style='font-size:0.7rem; color:#64748b;'>Atemp</div>"
                f"<div style='font-size:0.88rem; font-weight:700;'>{_atemp}</div></div>"
                f"<div style='background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:0.6rem;'>"
                f"<div style='font-size:0.7rem; color:#64748b;'>Build Year</div>"
                f"<div style='font-size:0.88rem; font-weight:700;'>{_byear}</div></div>"
                f"</div>",
                unsafe_allow_html=True,
            )

            # Full EPC fields toggle
            show_full = st.toggle("Show all EPC fields", value=False, key="s2p_reno_full_epc")
            if show_full:
                derived_keys = {"FormularId", "energy_systems", "ventilation_modes", "available_field_count", "total_field_count"}
                raw_rows = [
                    {"Field": k, "Value": "—" if _is_missing(v) else v}
                    for k, v in sorted(_pp.items(), key=lambda kv: kv[0].lower())
                    if k not in derived_keys and not _is_missing(v)
                ]
                if raw_rows:
                    st.dataframe(raw_rows, use_container_width=True, hide_index=True, height=300)

        if _reno_tabula_match:
            _conf = _reno_tabula_conf or {"level": "Medium", "score": 60, "reason": ""}
            _conf_color = {"High": "#33A9A0", "Medium": "#33528A", "Low": "#F59E0B"}.get(_conf["level"], "#94a3b8")
            st.markdown(
                f"<div style='margin-top:0.8rem; font-size:0.8rem; font-weight:700; color:#33528A; "
                f"text-transform:uppercase; letter-spacing:0.06em;'>TABULA Archetype</div>",
                unsafe_allow_html=True,
            )
            _u = _reno_tabula_match.get("u_values", {})
            _u_items = [(n, _u.get(n.lower())) for n in ["Wall", "Roof", "Floor", "Window", "Door"]]
            _u_html = " · ".join(
                f"{n}: {v:.2f}" for n, v in _u_items if v is not None and v > 0
            )
            st.markdown(
                f"<div style='padding:0.6rem 0.8rem; background:#f8fafc; border:1px solid #e2e8f0; "
                f"border-radius:10px; margin-top:0.3rem;'>"
                f"<div style='font-weight:700; font-size:0.9rem;'>{_reno_tabula_match['type_label']}</div>"
                f"<div style='font-size:0.8rem; color:#475569; margin-top:0.2rem;'>"
                f"Code: {_reno_tabula_match['code']} · Period: {_reno_tabula_match['period']} · "
                f"Zone {_reno_climate_zone}</div>"
                f"<div style='font-size:0.78rem; color:#64748b; margin-top:0.3rem;'>"
                f"U-values (W/m²K): {_u_html}</div>"
                f"<div style='margin-top:0.2rem;'>"
                f"<span style='background:rgba({_conf_color},0.12); color:{_conf_color}; "
                f"padding:1px 8px; border-radius:6px; font-size:0.7rem; font-weight:600;'>"
                f"{_conf['level']} confidence ({_conf['score']}%)</span></div>"
                f"</div>",
                unsafe_allow_html=True,
            )

            # EPC ↔ TABULA delta
            _epc_energy_perf = _reno_passport.get("EgiEnergiPrestanda")
            _epc_energy_num = None
            if _epc_energy_perf is not None:
                try:
                    _epc_energy_num = float(str(_epc_energy_perf))
                except (ValueError, TypeError):
                    pass
            _tabula_net = get_tabula_energy_for_zone(_reno_tabula_match, _reno_climate_zone)
            if _epc_energy_num and _tabula_net:
                _delta_info = compute_epc_tabula_delta(_epc_energy_num, _reno_tabula_match, _reno_climate_zone)
                if _delta_info:
                    st.session_state["epc_tabula_delta"] = _delta_info
                    _d_pct = _delta_info["delta_pct"]
                    _d_color = "#33A9A0" if abs(_d_pct) < 5 else "#8AB62E" if _d_pct < -5 else "#FF6B6B"
                    st.markdown(
                        f"<div style='margin-top:0.5rem; padding:0.6rem 0.8rem; "
                        f"border-left:3px solid {_d_color}; background:{_d_color}08; "
                        f"border-radius:0 10px 10px 0;'>"
                        f"<div style='font-size:0.78rem; font-weight:600; color:#334155;'>"
                        f"EPC ↔ TABULA: {_delta_info['delta_pct']:+.1f}% "
                        f"({_delta_info['epc']} vs {_delta_info['tabula']} kWh/m²)</div>"
                        f"<div style='font-size:0.75rem; color:#64748b;'>"
                        f"{_delta_info['interpretation']}</div>"
                        f"</div>",
                        unsafe_allow_html=True,
                    )
        elif not _reno_passport:
            st.info("No building selected yet. Select a location in Step 1+ to see EPC and TABULA data.")

    # Store coverage for downstream steps
    st.session_state["renovation_coverage"] = _coverage
    st.session_state["renovation_confidence_score"] = _conf_score

else:
    # ================================================================
    # NON-RENOVATION — ORIGINAL TWO-COLUMN LAYOUT
    # ================================================================
    pass

_is_reno_mode = (project_type == "Renovation Planning")

# For non-renovation, use original two-column layout
if not _is_reno_mode:
    left_col, right_col = st.columns([0.65, 0.35])

# ── Right: map + legend ────────────────────────────────
if not _is_reno_mode:
  with right_col:
    st.markdown("<div style='height:0.25rem;'></div>", unsafe_allow_html=True)

    # Location map + existing local data coverage (moved from Step 1+)
    if has_location_database():
        project_scale = st.session_state.get("project_scale", "")
        sel = st.session_state.get("location_selection", {})

        # Smooth address transition from Step 1+ to Step 2+:
        # if user typed a new address but did not click Locate, refresh coordinates here.
        if isinstance(sel, dict) and sel.get("mode") == "address":
            typed_addr = (st.session_state.get("location") or "").strip()
            selected_query = str(sel.get("query") or "").strip()
            if typed_addr and typed_addr != selected_query:
                try:
                    geocoded = geocode_address(typed_addr, st.session_state.get("country", "Sweden"))
                    if geocoded:
                        lat = float(geocoded["lat"])
                        lon = float(geocoded["lon"])
                        st.session_state["project_lat"] = lat
                        st.session_state["project_lon"] = lon
                        st.session_state["project_location_label"] = geocoded.get("display_name", typed_addr)
                        st.session_state["location_selection"] = {
                            "mode": "address",
                            "query": typed_addr,
                            "label": st.session_state["project_location_label"],
                            "lat": lat,
                            "lon": lon,
                            "radius_m": 80 if project_scale == "Building" else int(st.session_state.get("location_radius_m", 800)),
                        }
                        sel = st.session_state.get("location_selection", {})
                except Exception:
                    pass

        selection_mode = "Address + Radius"
        if isinstance(sel, dict) and sel.get("mode") == "bbox":
            selection_mode = "Draw Bounding Box"
        elif isinstance(sel, dict) and sel.get("mode") == "address":
            selection_mode = "Address + Radius"
        else:
            selection_mode = st.session_state.get("p1p_location_mode", "Address + Radius")
        if project_scale == "Building":
            selection_mode = "Address + Radius"
        snapshot = None
        location_label = st.session_state.get("project_location_label", st.session_state.get("location", "Selected location"))

        if selection_mode == "Draw Bounding Box" and isinstance(sel, dict) and sel.get("bbox"):
            b = sel["bbox"]
            snapshot = get_epc_snapshot_for_bbox(
                b["min_lat"], b["max_lat"], b["min_lon"], b["max_lon"], point_limit=1200
            )
            map_center_lat = (b["min_lat"] + b["max_lat"]) / 2
            map_center_lon = (b["min_lon"] + b["max_lon"]) / 2
            location_note = (
                f"Bounding box · lat [{b['min_lat']:.5f}, {b['max_lat']:.5f}] · "
                f"lon [{b['min_lon']:.5f}, {b['max_lon']:.5f}]"
            )
        elif selection_mode == "Draw Bounding Box" and st.session_state.get("project_bbox"):
            b = st.session_state["project_bbox"]
            snapshot = get_epc_snapshot_for_bbox(
                b["min_lat"], b["max_lat"], b["min_lon"], b["max_lon"], point_limit=1200
            )
            map_center_lat = (b["min_lat"] + b["max_lat"]) / 2
            map_center_lon = (b["min_lon"] + b["max_lon"]) / 2
            location_note = (
                f"Bounding box · lat [{b['min_lat']:.5f}, {b['max_lat']:.5f}] · "
                f"lon [{b['min_lon']:.5f}, {b['max_lon']:.5f}]"
            )
        elif selection_mode == "Address + Radius" and isinstance(sel, dict) and sel.get("lat") is not None and sel.get("lon") is not None:
            lat = float(sel["lat"])
            lon = float(sel["lon"])
            if project_scale == "Building":
                snapshot = get_nearby_epc_snapshot(lat, lon, radius_m=250, point_limit=300)
                addr_query = (sel.get("query") or st.session_state.get("location") or location_label)
                snapshot, chosen_addr, matched_by_query = _prepare_single_building_snapshot(snapshot, addr_query)
                if chosen_addr:
                    tag = "matched EPC building" if matched_by_query else "nearest EPC building"
                    location_note = f"{location_label} · {tag}: {chosen_addr}"
                else:
                    location_note = f"{location_label} · nearest EPC building"
            else:
                radius = int(sel.get("radius_m", st.session_state.get("location_radius_m", 800)))
                snapshot = get_nearby_epc_snapshot(lat, lon, radius_m=radius, point_limit=1000)
                location_note = f"{location_label} · radius {radius} m"
            map_center_lat = lat
            map_center_lon = lon
        elif "project_lat" in st.session_state and "project_lon" in st.session_state:
            lat = float(st.session_state["project_lat"])
            lon = float(st.session_state["project_lon"])
            if project_scale == "Building":
                snapshot = get_nearby_epc_snapshot(lat, lon, radius_m=250, point_limit=300)
                addr_query = st.session_state.get("location") or location_label
                snapshot, chosen_addr, matched_by_query = _prepare_single_building_snapshot(snapshot, addr_query)
                if chosen_addr:
                    tag = "matched EPC building" if matched_by_query else "nearest EPC building"
                    location_note = f"{location_label} · {tag}: {chosen_addr}"
                else:
                    location_note = f"{location_label} · nearest EPC building"
            else:
                radius = int(st.session_state.get("location_radius_m", 800))
                snapshot = get_nearby_epc_snapshot(lat, lon, radius_m=radius, point_limit=1000)
                location_note = f"{location_label} · radius {radius} m"
            map_center_lat = lat
            map_center_lon = lon
        else:
            # Fallback: if user has an address but no saved coordinates, geocode now.
            addr = (st.session_state.get("location") or "").strip()
            if addr:
                try:
                    geocoded = geocode_address(addr, st.session_state.get("country", "Sweden"))
                    if geocoded:
                        lat = float(geocoded["lat"])
                        lon = float(geocoded["lon"])
                        st.session_state["project_lat"] = lat
                        st.session_state["project_lon"] = lon
                        st.session_state["project_location_label"] = geocoded.get("display_name", addr)

                        if project_scale == "Building":
                            snapshot = get_nearby_epc_snapshot(lat, lon, radius_m=250, point_limit=300)
                            snapshot, chosen_addr, matched_by_query = _prepare_single_building_snapshot(snapshot, addr)
                            if chosen_addr:
                                tag = "matched EPC building" if matched_by_query else "nearest EPC building"
                                location_note = f"{st.session_state.get('project_location_label', addr)} · {tag}: {chosen_addr}"
                            else:
                                location_note = f"{st.session_state.get('project_location_label', addr)} · nearest EPC building"
                        else:
                            radius = int(st.session_state.get("location_radius_m", 800))
                            snapshot = get_nearby_epc_snapshot(lat, lon, radius_m=radius, point_limit=1000)
                            location_note = f"{st.session_state.get('project_location_label', addr)} · radius {radius} m"

                        map_center_lat = lat
                        map_center_lon = lon
                    else:
                        map_center_lat = map_center_lon = None
                        location_note = None
                except Exception:
                    map_center_lat = map_center_lon = None
                    location_note = None
            else:
                map_center_lat = map_center_lon = None
                location_note = None

        if snapshot is not None and map_center_lat is not None and map_center_lon is not None:
            points_df = snapshot["points"]
            summary = snapshot["summary"]
            classes_df = snapshot["classes"]
            sample_df = snapshot["sample"]
            linked_points_df = points_df[
                ~points_df["FormularId"].isna()
                & (
                    points_df["address"].notna()
                    | points_df["energy_class"].notna()
                    | points_df["energy_performance"].notna()
                    | points_df["build_year"].notna()
                    | points_df["atemp"].notna()
                )
            ].copy() if not points_df.empty else points_df
            if not linked_points_df.empty:
                linked_points_df = linked_points_df.drop_duplicates(subset=["FormularId"], keep="first")

            st.markdown(
                "<div style='font-size:0.9rem; font-weight:600; margin-top:0.8rem; margin-bottom:0.2rem;'>"
                "Local Footprints & Existing Data</div>",
                unsafe_allow_html=True,
            )
            st.caption(location_note)

            selected_row = None
            if not linked_points_df.empty:
              with st.expander("🗺️ Map — EPC Buildings", expanded=False):
                if project_scale == "Building":
                    st.caption("Teal point is the nearest footprint centroid for the selected building address.")
                else:
                    st.caption("Teal points are buildings with linked EPC data inside your selected radius or bounding box.")
                fmap = folium.Map(
                    location=[map_center_lat, map_center_lon],
                    zoom_start=13,
                    tiles="CartoDB positron",
                    control_scale=False,
                    prefer_canvas=True,
                )
                for _, r in linked_points_df.head(1200).iterrows():
                    rid_text = _safe_id_text(r.get("FormularId"))
                    ep_text = _display_value(r.get("energy_performance"))
                    tooltip = (
                        f"{r.get('address') if not _is_missing(r.get('address')) else 'Linked EPC building'}"
                        f" · EPC {_display_value(r.get('energy_class'))}"
                    )
                    popup = (
                        f"<b>{r.get('address') if not _is_missing(r.get('address')) else 'Address unavailable'}</b><br>"
                        f"FormularId: {rid_text}<br>"
                        f"Municipality: {_display_value(r.get('municipality'))}<br>"
                        f"Energy class: {_display_value(r.get('energy_class'))}<br>"
                        f"Energy performance: {ep_text}"
                    )
                    folium.CircleMarker(
                        location=[float(r["lat"]), float(r["lon"])],
                        radius=3,
                        weight=1,
                        color="#33A9A0",
                        fill=True,
                        fill_color="#33A9A0",
                        fill_opacity=0.8,
                        tooltip=folium.Tooltip(tooltip, sticky=True),
                        popup=folium.Popup(popup, max_width=320),
                    ).add_to(fmap)
                map_state = st_folium(fmap, width=None, height=300, key="s2p_location_points_map")

                clicked = (map_state or {}).get("last_object_clicked")
                if clicked:
                    click_lat = clicked.get("lat")
                    click_lng = clicked.get("lng")
                    if click_lat is not None and click_lng is not None:
                        selected_row = linked_points_df.assign(
                            _distance=(linked_points_df["lat"] - click_lat).abs() + (linked_points_df["lon"] - click_lng).abs()
                        ).sort_values("_distance").iloc[0]
                        st.session_state["s2p_selected_formular_id"] = _safe_id_text(selected_row.get("FormularId"))
            elif not points_df.empty:
                st.caption("Footprints were found here, but none of the mapped points in this selection currently have linked EPC details to display.")

            mc1, mc2 = st.columns(2)
            mc1.metric("Buildings", f"{summary.get('footprint_buildings', 0):,}")
            mc2.metric("EPC-linked buildings", f"{summary.get('epc_linked_buildings', 0):,}")
            st.caption(
                f"EPC rows in database for this area: {summary.get('epc_records', 0):,}. "
                "A single building can have multiple EPC rows (e.g., updated declarations/versions), "
                "so EPC rows can be higher than building count."
            )

            st.session_state["location_data_summary"] = summary
            st.session_state["location_classes"] = classes_df.to_dict("records")
            st.session_state["location_sample"] = sample_df.to_dict("records")

            # Building-level details (select from points currently plotted)
            if not linked_points_df.empty:
                points_with_id = linked_points_df.copy()
                if not points_with_id.empty:
                    points_with_id["_label"] = points_with_id.apply(
                        lambda r: (
                            (r["address"] if isinstance(r.get("address"), str) and r.get("address") else "Address unavailable")
                            + (f" · {r['municipality']}" if isinstance(r.get("municipality"), str) and r.get("municipality") else "")
                            + (f" · EPC {_display_value(r.get('energy_class'))}" if not _is_missing(r.get("energy_class")) else "")
                        ),
                        axis=1,
                    )
                    options = points_with_id["_label"].tolist()[:600]

                    if selected_row is not None:
                        st.session_state["s2p_selected_formular_id"] = _safe_id_text(selected_row.get("FormularId"))

                    preferred_id = st.session_state.get("s2p_selected_formular_id")
                    preferred_label = None
                    if preferred_id:
                        for label in options:
                            if label.startswith(str(preferred_id)):
                                preferred_label = label
                                break
                    if preferred_label is None and options:
                        preferred_label = options[0]

                    if preferred_label is not None and st.session_state.get("s2p_selected_building") != preferred_label:
                        st.session_state["s2p_selected_building"] = preferred_label

                    chosen = st.selectbox(
                        "Select a mapped building",
                        options=options,
                        key="s2p_selected_building",
                    )
                    selected_row = points_with_id[points_with_id["_label"] == chosen].iloc[0]
                    st.session_state["s2p_selected_formular_id"] = _safe_id_text(selected_row.get("FormularId"))

                    # Fetch data silently for session state (no rendering here)
                    passport = get_epc_building_passport(selected_row.get("FormularId")) or {}
                    st.session_state["epc_passport"] = passport

                    # TABULA matching (silent)
                    _epc_build_year = passport.get("EgenNybyggAr", selected_row.get("build_year"))
                    _epc_btype_raw = passport.get("EgenByggnadsTyp") or passport.get("EgenByggnadsKat") or ""
                    _epc_kommun = passport.get("IdKommun", selected_row.get("municipality")) or ""
                    _build_year_num = None
                    if _epc_build_year is not None:
                        try:
                            _build_year_num = int(float(str(_epc_build_year)))
                        except (ValueError, TypeError):
                            pass
                    _climate_zone = climate_zone_from_county(_epc_kommun)
                    if _climate_zone is None:
                        _lat = float(selected_row.get("lat", 0)) if selected_row.get("lat") else None
                        _climate_zone = climate_zone_from_lat(_lat) if _lat else 3
                    _tabula_match = None
                    _tabula_conf = None
                    if _build_year_num and _epc_btype_raw:
                        _tabula_match = match_archetype(_epc_btype_raw, _build_year_num)
                        _tabula_conf = match_confidence(_epc_btype_raw, _build_year_num)
                    elif _build_year_num:
                        for _try_field in ["EgenTypkod_typ", "EgenByggnadsKat"]:
                            _try_val = passport.get(_try_field, "")
                            if _try_val:
                                _tabula_match = match_archetype(str(_try_val), _build_year_num)
                                _tabula_conf = match_confidence(str(_try_val), _build_year_num)
                                if _tabula_match:
                                    break
                    st.session_state["tabula_archetype"] = _tabula_match
                    st.session_state["tabula_confidence"] = _tabula_conf
                    st.session_state["tabula_climate_zone"] = _climate_zone

                    # Quick summary badges (compact, on main page)
                    _epc_avail = int(passport.get("available_field_count", 0) or 0)
                    _epc_total = int(passport.get("total_field_count", 0) or 0)
                    _tab_lbl = _tabula_match["type_label"] if _tabula_match else "No match"
                    st.markdown(
                        f"<div style='display:flex; gap:0.4rem; flex-wrap:wrap; margin-top:0.4rem;'>"
                        f"<span style='background:rgba(51,169,160,0.10); color:#0f766e; "
                        f"padding:0.18rem 0.55rem; border-radius:999px; font-size:0.7rem; font-weight:600; "
                        f"border:1px solid rgba(51,169,160,0.25);'>"
                        f"EPC: {_epc_avail}/{_epc_total} fields</span>"
                        f"<span style='background:rgba(51,82,138,0.08); color:#33528A; "
                        f"padding:0.18rem 0.55rem; border-radius:999px; font-size:0.7rem; font-weight:600; "
                        f"border:1px solid rgba(51,82,138,0.15);'>"
                        f"TABULA: {_tab_lbl}</span>"
                        f"</div>",
                        unsafe_allow_html=True,
                    )

                # ── All details hidden behind expander ──
                with st.expander("🔍 Check Data Available — EPC Passport, TABULA & Local Data", expanded=False):
                    # Compute display variables needed by passport card
                    _key_fields = [
                        passport.get("IdAdr"), passport.get("IdKommun"),
                        passport.get("EgiEnergiklass"), passport.get("EgiEnergiPrestanda"),
                        passport.get("EgenNybyggAr"), passport.get("EgenAtemp"),
                    ]
                    completeness = sum(1 for v in _key_fields if not _is_missing(v))
                    total_fields = int(passport.get("total_field_count", 0) or 0)
                    available_fields = int(passport.get("available_field_count", 0) or 0)
                    energy_systems = passport.get("energy_systems", [])
                    ventilation_modes = passport.get("ventilation_modes", [])
                    systems_text = ", ".join(energy_systems) if energy_systems else "—"
                    ventilation_text = ", ".join(ventilation_modes) if ventilation_modes else "—"

                    suggested_labels = {
                        "AtgForslagStyrTeknisk": "Technical control optimization",
                        "AtgForslagInstTeknisk": "Installation technical upgrade",
                        "AtgForslagByggTeknisk": "Building envelope technical upgrade",
                        "AtgForslagNyVentil": "New ventilation system",
                        "AtgForslagJustVarme": "Adjust heating system",
                        "AtgForslagStyrVarme": "Heating control optimization",
                        "AtgForslagRengVarme": "Heating system cleaning",
                        "AtgForslagBegrTemp": "Limit indoor temperature",
                        "AtgForslagNyGivare": "New sensors",
                        "AtgForslagBytePumpar": "Replace pumps",
                        "AtgForslagAnnanVarme": "Other heating measure",
                        "AtgForslagJustVent": "Adjust ventilation",
                        "AtgForslagTidstyrVent": "Time-controlled ventilation",
                        "AtgForslagBehovstyrVent": "Demand-controlled ventilation",
                        "AtgForslagByteFlaktar": "Replace fans",
                        "AtgForslagAnnanVent": "Other ventilation measure",
                        "AtgForslagStyrBelys": "Lighting control optimization",
                        "AtgForslagStyrKyla": "Cooling control optimization",
                        "AtgForslagAnnanBelysKyla": "Other lighting/cooling measure",
                        "AtgForslagSparaVatten": "Water-saving measure",
                        "AtgForslagEffektivBelys": "Efficient lighting",
                        "AtgForslagIsolKanal": "Duct insulation",
                        "AtgForslagByteVarmepump": "Replace heat pump",
                        "AtgForslagByteAnnanVarme": "Replace other heating",
                        "AtgForslagByteVent": "Replace ventilation",
                        "AtgForslagAterVent": "Ventilation heat recovery",
                        "AtgForslagAnnanInst": "Other installation measure",
                        "AtgForslagIsolTak": "Roof insulation",
                        "AtgForslagIsolVagg": "Wall insulation",
                        "AtgForslagIsolMark": "Ground/floor insulation",
                        "AtgForslagInstSolceller": "Install solar PV",
                        "AtgForslagInstSolvarme": "Install solar thermal",
                        "AtgForslagByteFonster": "Replace windows",
                        "AtgForslagKompFonster": "Window complement",
                        "AtgForslagTatFonster": "Seal/tighten windows",
                        "AtgForslagAnnanBygg": "Other building envelope measure",
                    }
                    suggested_measures = []
                    for key, label in suggested_labels.items():
                        val = passport.get(key)
                        vtxt = str(val).strip().lower()
                        if val is not None and vtxt not in {"", "<na>", "none", "nan", "nej", "no", "0", "false"}:
                            suggested_measures.append(label)
                    savings_text = _display_value(passport.get("AtgForslagEgiMinskad"))
                    cost_text = _display_value(passport.get("AtgForslagKostnad"))
                    co2_text = _display_value(passport.get("AtgForslagCO2"))

                    st.markdown(
                        f"""
                        <div style='border:1px solid #d5e3ea; border-radius:16px; padding:1rem; margin-top:0.45rem; background:linear-gradient(180deg, #fbfdff 0%, #f4fafc 100%); box-shadow:0 8px 24px rgba(51,82,138,0.08);'>
                            <div style='display:flex; justify-content:space-between; align-items:flex-start; gap:0.6rem;'>
                                <div>
                                    <div style='font-size:0.74rem; color:#33528A; text-transform:uppercase; letter-spacing:0.08em; font-weight:700;'>Building Passport</div>
                                    <div style='font-size:1.05rem; font-weight:800; color:#0f172a; margin-top:0.18rem;'>{_display_value(passport.get('IdAdr', selected_row.get('address')))}</div>
                                    <div style='font-size:0.84rem; color:#475569; margin-top:0.14rem;'>{_display_value(passport.get('IdPostort'))} · {_display_value(passport.get('IdKommun', selected_row.get('municipality')))}</div>
                                </div>
                                <div style='background:rgba(51,169,160,0.10); color:#0f766e; border:1px solid rgba(51,169,160,0.25); border-radius:999px; padding:0.2rem 0.6rem; font-size:0.74rem; font-weight:600;'>
                                    {completeness}/6 key fields · {available_fields}/{total_fields if total_fields else '—'} EPC fields
                                </div>
                            </div>
                            <div style='display:grid; grid-template-columns:1fr 1fr; gap:0.55rem; margin-top:0.85rem;'>
                                <div style='background:#ffffff; border-radius:10px; padding:0.68rem; border:1px solid #e2e8f0;'><div style='font-size:0.72rem; color:#64748b;'>Energy Class</div><div style='font-size:0.92rem; font-weight:700; color:#0f172a;'>{_display_value(passport.get('EgiEnergiklass', selected_row.get('energy_class')))}</div></div>
                                <div style='background:#ffffff; border-radius:10px; padding:0.68rem; border:1px solid #e2e8f0;'><div style='font-size:0.72rem; color:#64748b;'>Energy Performance</div><div style='font-size:0.92rem; font-weight:700; color:#0f172a;'>{_display_value(passport.get('EgiEnergiPrestanda', selected_row.get('energy_performance')))}</div></div>
                                <div style='background:#ffffff; border-radius:10px; padding:0.68rem; border:1px solid #e2e8f0;'><div style='font-size:0.72rem; color:#64748b;'>Specific Energy Use</div><div style='font-size:0.92rem; font-weight:700; color:#0f172a;'>{_display_value(passport.get('EgiSpecifikEnergianvandning'))}</div></div>
                                <div style='background:#ffffff; border-radius:10px; padding:0.68rem; border:1px solid #e2e8f0;'><div style='font-size:0.72rem; color:#64748b;'>Primary Energy</div><div style='font-size:0.92rem; font-weight:700; color:#0f172a;'>{_display_value(passport.get('EgiPrimarenergianvandning'))}</div></div>
                                <div style='background:#ffffff; border-radius:10px; padding:0.68rem; border:1px solid #e2e8f0;'><div style='font-size:0.72rem; color:#64748b;'>Atemp</div><div style='font-size:0.92rem; font-weight:700; color:#0f172a;'>{_display_value(passport.get('EgenAtemp', selected_row.get('atemp')), ' m²')}</div></div>
                                <div style='background:#ffffff; border-radius:10px; padding:0.68rem; border:1px solid #e2e8f0;'><div style='font-size:0.72rem; color:#64748b;'>Build Year</div><div style='font-size:0.92rem; font-weight:700; color:#0f172a;'>{_display_value(passport.get('EgenNybyggAr', selected_row.get('build_year')))}</div></div>
                                <div style='background:#ffffff; border-radius:10px; padding:0.68rem; border:1px solid #e2e8f0;'><div style='font-size:0.72rem; color:#64748b;'>Number of Floors</div><div style='font-size:0.92rem; font-weight:700; color:#0f172a;'>{_display_value(passport.get('EgenAntalPlan'))}</div></div>
                                <div style='background:#ffffff; border-radius:10px; padding:0.68rem; border:1px solid #e2e8f0;'><div style='font-size:0.72rem; color:#64748b;'>Apartments</div><div style='font-size:0.92rem; font-weight:700; color:#0f172a;'>{_display_value(passport.get('EgenAntalBolgh'))}</div></div>
                                <div style='background:#ffffff; border-radius:10px; padding:0.68rem; border:1px solid #e2e8f0;'><div style='font-size:0.72rem; color:#64748b;'>Building Type</div><div style='font-size:0.92rem; font-weight:700; color:#0f172a;'>{_display_value(passport.get('EgenByggnadsTyp'))}</div></div>
                                <div style='background:#ffffff; border-radius:10px; padding:0.68rem; border:1px solid #e2e8f0;'><div style='font-size:0.72rem; color:#64748b;'>Building Category</div><div style='font-size:0.92rem; font-weight:700; color:#0f172a;'>{_display_value(passport.get('EgenByggnadsKat'))}</div></div>
                                <div style='background:#ffffff; border-radius:10px; padding:0.68rem; border:1px solid #e2e8f0;'><div style='font-size:0.72rem; color:#64748b;'>Typcode</div><div style='font-size:0.92rem; font-weight:700; color:#0f172a;'>{_display_value(passport.get('EgenTypkod_typ'))}</div></div>
                                <div style='background:#ffffff; border-radius:10px; padding:0.68rem; border:1px solid #e2e8f0;'><div style='font-size:0.72rem; color:#64748b;'>Complexity</div><div style='font-size:0.92rem; font-weight:700; color:#0f172a;'>{_display_value(passport.get('EgenKomplexitet'))}</div></div>
                            </div>
                            <div style='margin-top:0.55rem; background:#fff; border:1px dashed #cbd5e1; border-radius:12px; padding:0.7rem 0.8rem;'>
                                <div style='font-size:0.74rem; color:#475569; line-height:1.45;'><b>Specific Energy Use</b>: energy use per m² Atemp (commonly kWh/m²·year), useful for comparing buildings of different sizes.</div>
                                <div style='font-size:0.74rem; color:#475569; line-height:1.45; margin-top:0.35rem;'><b>Primary Energy</b>: delivered energy adjusted by national primary-energy factors (source and conversion impact), used for regulatory performance assessment.</div>
                            </div>
                            <div style='display:grid; grid-template-columns:1fr 1fr; gap:0.55rem; margin-top:0.55rem;'>
                                <div style='background:rgba(51,82,138,0.06); border:1px solid rgba(51,82,138,0.14); border-radius:12px; padding:0.75rem;'>
                                    <div style='font-size:0.72rem; color:#33528A; font-weight:700; text-transform:uppercase; letter-spacing:0.05em;'>Energy Systems</div>
                                    <div style='font-size:0.88rem; color:#0f172a; margin-top:0.35rem; line-height:1.45;'>{systems_text}</div>
                                </div>
                                <div style='background:rgba(196,232,29,0.10); border:1px solid rgba(196,232,29,0.22); border-radius:12px; padding:0.75rem;'>
                                    <div style='font-size:0.72rem; color:#597001; font-weight:700; text-transform:uppercase; letter-spacing:0.05em;'>Ventilation & Status</div>
                                    <div style='font-size:0.88rem; color:#0f172a; margin-top:0.35rem; line-height:1.45;'>Ventilation: {ventilation_text}<br>Approved: {_display_value(passport.get('Godkand'))}<br>Ventilation check: {_display_value(passport.get('VentGruppGodkand'))}</div>
                                </div>
                            </div>
                            <div style='margin-top:0.55rem; background:rgba(255,255,255,0.96); border:1px solid #e2e8f0; border-radius:12px; padding:0.75rem;'>
                                <div style='font-size:0.72rem; color:#334155; font-weight:700; text-transform:uppercase; letter-spacing:0.05em;'>Suggested measures (AtgForslag*)</div>
                                <div style='font-size:0.86rem; color:#0f172a; margin-top:0.35rem; line-height:1.45;'>
                                    {'<br>'.join(['• ' + m for m in suggested_measures]) if suggested_measures else 'No suggested measures recorded for this EPC row.'}
                                </div>
                                <div style='display:grid; grid-template-columns:1fr 1fr 1fr; gap:0.5rem; margin-top:0.55rem;'>
                                    <div style='background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:0.55rem;'><div style='font-size:0.7rem; color:#64748b;'>Expected energy saving</div><div style='font-size:0.9rem; font-weight:700; color:#0f172a;'>{savings_text}</div></div>
                                    <div style='background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:0.55rem;'><div style='font-size:0.7rem; color:#64748b;'>Estimated cost</div><div style='font-size:0.9rem; font-weight:700; color:#0f172a;'>{cost_text}</div></div>
                                    <div style='background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:0.55rem;'><div style='font-size:0.7rem; color:#64748b;'>Estimated CO₂ impact</div><div style='font-size:0.9rem; font-weight:700; color:#0f172a;'>{co2_text}</div></div>
                                </div>
                            </div>
                        </div>
                        """,
                        unsafe_allow_html=True,
                    )

                    show_full_epc = st.toggle("Show full EPC fields for selected building", value=False, key="s2p_show_full_epc")
                    if show_full_epc:
                        show_empty_fields = st.checkbox(
                            "Show empty/missing fields",
                            value=False,
                            key="s2p_passport_show_empty",
                        )
                        derived_keys = {
                            "FormularId",
                            "energy_systems",
                            "ventilation_modes",
                            "available_field_count",
                            "total_field_count",
                        }
                        raw_rows = []
                        for field_name, value in sorted(passport.items(), key=lambda kv: kv[0].lower()):
                            if field_name in derived_keys:
                                continue
                            if (not show_empty_fields) and _is_missing(value):
                                continue
                            raw_rows.append(
                                {
                                    "Field": field_name,
                                    "Value": "—" if _is_missing(value) else value,
                                }
                            )

                        st.caption(
                            f"Showing {len(raw_rows):,} fields"
                            + (f" (of {total_fields:,} total EPC fields)." if total_fields else ".")
                        )
                        if raw_rows:
                            st.dataframe(raw_rows, use_container_width=True, hide_index=True, height=380)
                        else:
                            st.caption("No fields to display for this selection.")

                    # ============================================================
                    # TABULA / EPISCOPE — ARCHETYPE MATCH + OVERLAP PANEL
                    # ============================================================
                    _epc_build_year = passport.get("EgenNybyggAr", selected_row.get("build_year"))
                    _epc_btype_raw = passport.get("EgenByggnadsTyp") or passport.get("EgenByggnadsKat") or ""
                    _epc_energy_perf = passport.get("EgiEnergiPrestanda", selected_row.get("energy_performance"))
                    _epc_kommun = passport.get("IdKommun", selected_row.get("municipality")) or ""

                    # Try to get numeric build year
                    _build_year_num = None
                    if _epc_build_year is not None:
                        try:
                            _build_year_num = int(float(str(_epc_build_year)))
                        except (ValueError, TypeError):
                            pass

                    # Try to get numeric energy performance
                    _epc_energy_num = None
                    if _epc_energy_perf is not None:
                        try:
                            _epc_energy_num = float(str(_epc_energy_perf))
                        except (ValueError, TypeError):
                            pass

                    # Determine climate zone
                    _climate_zone = climate_zone_from_county(_epc_kommun)
                    if _climate_zone is None:
                        _lat = float(selected_row.get("lat", 0)) if selected_row.get("lat") else None
                        _climate_zone = climate_zone_from_lat(_lat) if _lat else 3  # default south

                    _tabula_match = None
                    _tabula_conf = None
                    if _build_year_num and _epc_btype_raw:
                        _tabula_match = match_archetype(_epc_btype_raw, _build_year_num)
                        _tabula_conf = match_confidence(_epc_btype_raw, _build_year_num)
                    elif _build_year_num:
                        # Fallback: try typkod or category
                        for _try_field in ["EgenTypkod_typ", "EgenByggnadsKat"]:
                            _try_val = passport.get(_try_field, "")
                            if _try_val:
                                _tabula_match = match_archetype(str(_try_val), _build_year_num)
                                _tabula_conf = match_confidence(str(_try_val), _build_year_num)
                                if _tabula_match:
                                    break

                    # Store for downstream steps
                    st.session_state["tabula_archetype"] = _tabula_match
                    st.session_state["tabula_confidence"] = _tabula_conf
                    st.session_state["tabula_climate_zone"] = _climate_zone

                    st.markdown(
                        "<div style='font-size:0.74rem; color:#33528A; text-transform:uppercase; "
                        "letter-spacing:0.08em; font-weight:700; margin-top:1.2rem;'>"
                        "🏛️ TABULA Archetype Match</div>",
                        unsafe_allow_html=True,
                    )

                    if _tabula_match:
                        _conf = _tabula_conf or {"level": "Medium", "score": 60, "reason": ""}
                        _conf_color = {
                            "High": "#33A9A0", "Medium": "#33528A", "Low": "#F59E0B", "None": "#94a3b8"
                        }.get(_conf["level"], "#94a3b8")
                        _conf_bg = {
                            "High": "rgba(51,169,160,0.12)", "Medium": "rgba(51,82,138,0.10)",
                            "Low": "rgba(245,158,11,0.12)", "None": "rgba(148,163,184,0.10)"
                        }.get(_conf["level"], "rgba(148,163,184,0.10)")

                        _tabula_net = get_tabula_energy_for_zone(_tabula_match, _climate_zone)

                        st.markdown(
                            f"<div style='border:1px solid {_conf_color}40; border-radius:14px; "
                            f"padding:0.9rem 1rem; margin-top:0.4rem; "
                            f"background:linear-gradient(180deg, #fbfdff 0%, #f4fafc 100%); "
                            f"box-shadow:0 4px 16px rgba(51,82,138,0.06);'>"
                            f"<div style='display:flex; justify-content:space-between; align-items:center; "
                            f"margin-bottom:0.6rem;'>"
                            f"<span style='font-weight:700; font-size:0.92rem; color:#0f172a;'>"
                            f"{_tabula_match['type_label']}</span>"
                            f"<span style='background:{_conf_bg}; color:{_conf_color}; "
                            f"padding:0.15rem 0.6rem; border-radius:999px; font-size:0.72rem; "
                            f"font-weight:700; border:1px solid {_conf_color}30;'>"
                            f"{_conf['level']} confidence</span>"
                            f"</div>"
                            f"<div style='display:grid; grid-template-columns:1fr 1fr; gap:0.45rem;'>"
                            f"<div style='background:#fff; border:1px solid #e2e8f0; border-radius:10px; "
                            f"padding:0.55rem;'>"
                            f"<div style='font-size:0.7rem; color:#64748b;'>Archetype Code</div>"
                            f"<div style='font-size:0.88rem; font-weight:700; color:#0f172a;'>"
                            f"{_tabula_match['code']}</div></div>"
                            f"<div style='background:#fff; border:1px solid #e2e8f0; border-radius:10px; "
                            f"padding:0.55rem;'>"
                            f"<div style='font-size:0.7rem; color:#64748b;'>Period</div>"
                            f"<div style='font-size:0.88rem; font-weight:700; color:#0f172a;'>"
                            f"{_tabula_match['period']}</div></div>"
                            f"<div style='background:#fff; border:1px solid #e2e8f0; border-radius:10px; "
                            f"padding:0.55rem;'>"
                            f"<div style='font-size:0.7rem; color:#64748b;'>Climate Zone</div>"
                            f"<div style='font-size:0.88rem; font-weight:700; color:#0f172a;'>"
                            f"Zone {_climate_zone}</div></div>"
                            f"<div style='background:#fff; border:1px solid #e2e8f0; border-radius:10px; "
                            f"padding:0.55rem;'>"
                            f"<div style='font-size:0.7rem; color:#64748b;'>TABULA Net Heating</div>"
                            f"<div style='font-size:0.88rem; font-weight:700; color:#0f172a;'>"
                            f"{_tabula_net:.1f} kWh/m²" if _tabula_net else "—"
                            f"</div></div>"
                            f"</div>",
                            unsafe_allow_html=True,
                        )

                        # ── U-value comparison ──
                        _u = _tabula_match.get("u_values", {})
                        _u_items = [
                            ("Wall", _u.get("wall")),
                            ("Roof", _u.get("roof")),
                            ("Floor", _u.get("floor")),
                            ("Window", _u.get("window")),
                            ("Door", _u.get("door")),
                        ]
                        _u_html = "".join(
                            f"<div style='text-align:center;'>"
                            f"<div style='font-size:1rem; font-weight:700; color:#33528A;'>"
                            f"{v:.2f}</div>"
                            f"<div style='font-size:0.68rem; color:#64748b;'>{n}</div></div>"
                            for n, v in _u_items if v is not None and v > 0
                        )
                        st.markdown(
                            f"<div style='margin-top:0.5rem; padding:0.6rem 0.8rem; "
                            f"background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px;'>"
                            f"<div style='font-size:0.72rem; color:#475569; font-weight:600; "
                            f"margin-bottom:0.35rem;'>TABULA U-values (W/m²K)</div>"
                            f"<div style='display:flex; justify-content:space-around; gap:0.4rem;'>"
                            f"{_u_html}</div></div>",
                            unsafe_allow_html=True,
                        )

                        # ── EPC ↔ TABULA Energy Overlap Panel ──
                        if _epc_energy_num and _tabula_net:
                            _delta_info = compute_epc_tabula_delta(
                                _epc_energy_num, _tabula_match, _climate_zone
                            )
                            if _delta_info:
                                _d_pct = _delta_info["delta_pct"]
                                if abs(_d_pct) < 5:
                                    _d_color = "#33A9A0"
                                    _d_icon = "✅"
                                elif _d_pct < -5:
                                    _d_color = "#8AB62E"
                                    _d_icon = "💚"
                                else:
                                    _d_color = "#FF6B6B"
                                    _d_icon = "⚠️"

                                st.markdown(
                                    f"<div style='margin-top:0.6rem; border:2px solid {_d_color}40; "
                                    f"border-radius:14px; padding:0.85rem 1rem; "
                                    f"background:linear-gradient(135deg, {_d_color}08 0%, #ffffff 100%);'>"
                                    f"<div style='font-size:0.74rem; color:#33528A; font-weight:700; "
                                    f"text-transform:uppercase; letter-spacing:0.08em; "
                                    f"margin-bottom:0.5rem;'>"
                                    f"📊 EPC ↔ TABULA Energy Overlap</div>"
                                    f"<div style='display:grid; grid-template-columns:1fr 1fr 1fr; "
                                    f"gap:0.5rem;'>"
                                    f"<div style='background:#fff; border-radius:10px; padding:0.6rem; "
                                    f"border:1px solid #e2e8f0; text-align:center;'>"
                                    f"<div style='font-size:0.68rem; color:#64748b;'>EPC Actual</div>"
                                    f"<div style='font-size:1.1rem; font-weight:800; color:#33528A;'>"
                                    f"{_delta_info['epc']}</div>"
                                    f"<div style='font-size:0.65rem; color:#94a3b8;'>kWh/m²</div></div>"
                                    f"<div style='background:#fff; border-radius:10px; padding:0.6rem; "
                                    f"border:1px solid #e2e8f0; text-align:center;'>"
                                    f"<div style='font-size:0.68rem; color:#64748b;'>TABULA Expected</div>"
                                    f"<div style='font-size:1.1rem; font-weight:800; color:#8AB62E;'>"
                                    f"{_delta_info['tabula']}</div>"
                                    f"<div style='font-size:0.65rem; color:#94a3b8;'>kWh/m² (Z{_climate_zone})</div></div>"
                                    f"<div style='background:#fff; border-radius:10px; padding:0.6rem; "
                                    f"border:1px solid {_d_color}30; text-align:center;'>"
                                    f"<div style='font-size:0.68rem; color:#64748b;'>Delta</div>"
                                    f"<div style='font-size:1.1rem; font-weight:800; color:{_d_color};'>"
                                    f"{_d_icon} {_delta_info['delta_pct']:+.1f}%</div>"
                                    f"<div style='font-size:0.65rem; color:#94a3b8;'>"
                                    f"{_delta_info['delta']:+.1f} kWh/m²</div></div>"
                                    f"</div>"
                                    f"<div style='margin-top:0.5rem; font-size:0.82rem; color:#475569; "
                                    f"background:#f8fafc; border-radius:8px; padding:0.5rem 0.7rem; "
                                    f"border-left:3px solid {_d_color};'>"
                                    f"{_delta_info['interpretation']}</div>"
                                    f"</div>",
                                    unsafe_allow_html=True,
                                )

                                # Store overlap for downstream
                                st.session_state["epc_tabula_delta"] = _delta_info
                    else:
                        _reason = (_tabula_conf or {}).get("reason", "No match found")
                        st.markdown(
                            f"<div style='border:1px dashed #cbd5e1; border-radius:12px; "
                            f"padding:0.75rem 1rem; margin-top:0.4rem; background:#f8fafc;'>"
                            f"<div style='font-size:0.85rem; color:#64748b;'>"
                            f"No TABULA archetype match available</div>"
                            f"<div style='font-size:0.78rem; color:#94a3b8; margin-top:0.2rem;'>"
                            f"{_reason}</div>"
                            f"</div>",
                            unsafe_allow_html=True,
                        )

                    # Local EPC distribution (inside expander)
                    st.markdown(
                        "<div style='font-size:0.92rem; font-weight:600; color:#334155; "
                        "margin:1.2rem 0 0.5rem 0; padding:10px 14px; "
                        "background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px;'>"
                        "Local EPC data found near this location</div>",
                        unsafe_allow_html=True,
                    )
                    p1, p2 = st.columns([1, 1.4])
                    with p1:
                        st.markdown("**Energy class distribution**")
                        if classes_df.empty:
                            st.caption("No EPC class records in selected area.")
                        else:
                            st.dataframe(classes_df, use_container_width=True, hide_index=True)
                    with p2:
                        st.markdown("**Sample EPC records**")
                        if sample_df.empty:
                            st.caption("No sample EPC records in selected area.")
                        else:
                            st.dataframe(sample_df, use_container_width=True, hide_index=True)
        else:
            st.info("No mapped area found yet. In Step 1+, set an address (and click Locate) or draw a bounding box.")

    # Legend
    st.markdown(
        "<div style='display:flex; flex-direction:column; gap:4px; "
        "margin-top:0.8rem; font-size:0.78rem;'>"
        "<span style='font-weight:600; color:#597001;'>Sensitivity ranking</span>"
        "<span style='color:#33A9A0; font-weight:600;'>🔴 High impact</span>"
        "<span style='color:#8AB62E; font-weight:600;'>🟡 Medium impact</span>"
        "<span style='color:#33528A; font-weight:600;'>🔵 Low impact</span>"
        "</div>",
        unsafe_allow_html=True,
    )

# ── Left: data inputs grouped by system ─────────────────────────────
if not _is_reno_mode:
  with left_col:
    st.markdown(
        "<hr style='margin:0.3rem 0 0.7rem 0; border:none; "
        "border-top:1px solid #e2e8f0;'>",
        unsafe_allow_html=True,
    )
    st.markdown(
        "<div style='font-size:1.02rem; font-weight:600; "
        "margin-bottom:0.2rem;'>Do you have the following data inputs?</div>",
        unsafe_allow_html=True,
    )

    for sys_group in data_inputs:
        sys_name = sys_group["system"]
        sys_items_count = sum(len(c["items"]) for c in sys_group["categories"])
        _expander_key = f"s2p_expand_{sys_name.replace(' ','_')}"
        _show_sys = st.toggle(f"{sys_name}  ({sys_items_count} inputs)", value=False, key=_expander_key)
        if _show_sys:
            for cat in sys_group["categories"]:
                # Lightweight sub-header for each category
                st.markdown(
                    f"<div style='font-size:0.85rem; font-weight:600; "
                    f"color:#475569; border-bottom:2px solid #e2e8f0; "
                    f"padding-bottom:2px; margin:0.6rem 0 0.3rem 0;'>"
                    f"{cat['category']}</div>",
                    unsafe_allow_html=True,
                )
                sorted_items = sorted(
                    cat["items"],
                    key=lambda it: get_sensitivity_weight(it["key"], sa_analysis_type),
                    reverse=True,
                )
                for item in sorted_items:
                    _render_item(item, sa_analysis_type)

# ============================================================================
# PERSIST DATA CHOICES
# ============================================================================

if not _is_reno_mode:
    _persisted = {}
    for it in all_items:
        ik = it["key"]
        _persisted[ik] = {
            "has_data": st.session_state.get(f"{page_key}_{ik}_has", "Yes"),
            "proxy": st.session_state.get(f"{page_key}_{ik}_proxy"),
        }
    st.session_state["step2_data_choices"] = _persisted
    st.session_state["step2_page_key"] = page_key

# ============================================================================
# NAVIGATION
# ============================================================================

st.markdown("---")
col1, col2, col3, col4 = st.columns([1, 1, 1, 2])

with col1:
    if st.button("Home", key="s2p_home"):
        st.switch_page("planning_guide.py")

with col2:
    if st.button("Back", key="s2p_back"):
        st.switch_page("pages/0_Define_Project.py")

with col3:
    if st.button("Continue", type="primary", key="s2p_next"):
        if project_type == "Renovation Planning":
            st.switch_page("pages/3plus_Data_Inputs.py")
        else:
            st.switch_page("pages/3_Analysis_Method.py")

with col4:
    st.markdown(
        "<div style='text-align:right; color:#94a3b8; font-size:0.85rem; "
        "padding-top:0.5rem;'>Step 2+ of 7</div>",
        unsafe_allow_html=True,
    )
