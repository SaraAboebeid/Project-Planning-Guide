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
)
from config.data_inputs import get_proxy_confidence
from utils.shared_css import inject_shared_css, render_step_indicator, render_top_cards
from utils.location_data import (
    has_location_database,
    get_nearby_epc_snapshot,
    get_epc_snapshot_for_bbox,
    geocode_address,
)

st.set_page_config(page_title="Review Data (Step 2+)", layout="wide")
inject_shared_css()

# Hide sidebar + tighter spacing for data items
st.markdown("""
<style>
    [data-testid="stSidebarNav"] {display: none;}
    section[data-testid="stSidebar"] {display: none;}
    /* Compact spacing inside expanders */
    .s2p-item { margin-bottom: 0.15rem; padding-bottom: 0.15rem;
                border-bottom: 1px solid #f1f5f9; }
    .s2p-item:last-child { border-bottom: none; }
    .s2p-subhdr { font-size: 0.82rem; font-weight: 600; color: #475569;
                   margin: 0.5rem 0 0.2rem 0; text-transform: uppercase;
                   letter-spacing: 0.04em; }
</style>
""", unsafe_allow_html=True)

render_step_indicator(2)

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

st.markdown(
    "<h2 style='font-size:1.5rem; font-weight:700; color:#0f172a; "
    "letter-spacing:-0.01em; margin-bottom:0.5rem;'>"
    "Step 2+: Review Data Inputs</h2>",
    unsafe_allow_html=True,
)
st.markdown(
    "<p style='font-size:0.92rem; color:#64748b; margin-top:-0.5rem; "
    "margin-bottom:0.7rem;'>"
    "Review the required data inputs for each system in scope and "
    "select proxy alternatives if needed.</p>",
    unsafe_allow_html=True,
)

# Context bar
_ctx = f"<span style='font-size:0.88rem; color:#475569;'><b>Project Type:</b> {project_type}"
if project_type == "Energy Community Planning":
    _ctx += f" | <b>Focus:</b> {ec_focus}"
_ctx += f" | <b>Systems:</b> {', '.join(systems)}"
if country:
    _ctx += f" | <b>Context:</b> {country}"
_ctx += "</span>"
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
        f"<span style='font-size:0.78rem; color:#94a3b8; margin-left:8px;'>"
        f"{recommended_source}</span></div>",
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
        st.plotly_chart(fig, key="re_butterfly", width="stretch")

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
        st.plotly_chart(fig, key="re_morris", width="stretch")

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
        st.plotly_chart(fig, key="re_seasonal", width="stretch")

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
        st.plotly_chart(fig, key="re_waterfall_pv", width="stretch")

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

left_col, right_col = st.columns([0.65, 0.35])

# ── Right: summary cards + SA button ────────────────────────────────
with right_col:
    st.markdown("<div style='height:0.25rem;'></div>", unsafe_allow_html=True)

    # Location map + existing local data coverage (moved from Step 1+)
    if has_location_database():
        project_scale = st.session_state.get("project_scale", "")
        sel = st.session_state.get("location_selection", {})
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
                if not snapshot["points"].empty:
                    nearest_df = snapshot["points"].sort_values("distance_m", ascending=True).head(1).copy()
                    snapshot["points"] = nearest_df
                    snapshot["sample"] = nearest_df[
                        ["address", "post_town", "municipality", "energy_class", "energy_performance"]
                    ].rename(
                        columns={
                            "address": "address",
                            "post_town": "post_town",
                            "municipality": "municipality",
                            "energy_class": "energy_class",
                            "energy_performance": "energy_performance",
                        }
                    )
                    snapshot["classes"] = nearest_df[["energy_class"]].copy()
                    snapshot["classes"]["energy_class"] = snapshot["classes"]["energy_class"].fillna("Unknown")
                    snapshot["classes"]["records"] = 1
                    has_epc = 1 if nearest_df["energy_performance"].notna().any() else 0
                    has_class = 1 if nearest_df["energy_class"].notna().any() else 0
                    snapshot["summary"] = {
                        "footprint_points": 1,
                        "footprint_buildings": 1,
                        "epc_records": 1 if nearest_df["FormularId"].notna().any() else 0,
                        "has_energy_class": has_class,
                        "has_energy_performance": has_epc,
                        "has_build_year": 1 if nearest_df["build_year"].notna().any() else 0,
                        "has_atemp": 1 if nearest_df["atemp"].notna().any() else 0,
                        "radius_m": 0,
                    }
                location_note = f"{location_label} · nearest building"
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
                if not snapshot["points"].empty:
                    nearest_df = snapshot["points"].sort_values("distance_m", ascending=True).head(1).copy()
                    snapshot["points"] = nearest_df
                location_note = f"{location_label} · nearest building"
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
                            if not snapshot["points"].empty:
                                nearest_df = snapshot["points"].sort_values("distance_m", ascending=True).head(1).copy()
                                snapshot["points"] = nearest_df
                                snapshot["sample"] = nearest_df[
                                    ["address", "post_town", "municipality", "energy_class", "energy_performance"]
                                ]
                                snapshot["classes"] = nearest_df[["energy_class"]].copy()
                                snapshot["classes"]["energy_class"] = snapshot["classes"]["energy_class"].fillna("Unknown")
                                snapshot["classes"]["records"] = 1
                                has_epc = 1 if nearest_df["energy_performance"].notna().any() else 0
                                has_class = 1 if nearest_df["energy_class"].notna().any() else 0
                                snapshot["summary"] = {
                                    "footprint_points": 1,
                                    "footprint_buildings": 1,
                                    "epc_records": 1 if nearest_df["FormularId"].notna().any() else 0,
                                    "has_energy_class": has_class,
                                    "has_energy_performance": has_epc,
                                    "has_build_year": 1 if nearest_df["build_year"].notna().any() else 0,
                                    "has_atemp": 1 if nearest_df["atemp"].notna().any() else 0,
                                    "radius_m": 0,
                                }
                            location_note = f"{st.session_state.get('project_location_label', addr)} · nearest building"
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

            st.markdown(
                "<div style='font-size:0.9rem; font-weight:600; margin-top:0.8rem; margin-bottom:0.2rem;'>"
                "Local Footprints & Existing Data</div>",
                unsafe_allow_html=True,
            )
            st.caption(location_note)
            if project_scale == "Building":
                st.caption("Teal point is the nearest footprint centroid for the selected building address.")
            else:
                st.caption("Teal points are footprint centroids within your selected radius or bounding box.")

            if not points_df.empty:
                fmap = folium.Map(
                    location=[map_center_lat, map_center_lon],
                    zoom_start=13,
                    tiles="CartoDB positron",
                    control_scale=False,
                    prefer_canvas=True,
                )
                for _, r in points_df.head(1200).iterrows():
                    rid_raw = r.get("FormularId")
                    try:
                        rid_text = str(int(rid_raw))
                    except (TypeError, ValueError):
                        rid_text = "N/A"

                    ep_raw = r.get("energy_performance")
                    ep_text = "-" if ep_raw is None or str(ep_raw).lower() == "<na>" else str(ep_raw)

                    popup = (
                        f"FormularId: {rid_text}<br>"
                        f"Address: {r.get('address') or '-'}<br>"
                        f"Municipality: {r.get('municipality') or '-'}<br>"
                        f"Energy class: {r.get('energy_class') or '-'}<br>"
                        f"Energy performance: {ep_text}"
                    )
                    folium.CircleMarker(
                        location=[float(r["lat"]), float(r["lon"])],
                        radius=2,
                        weight=1,
                        color="#33A9A0",
                        fill=True,
                        fill_color="#33A9A0",
                        fill_opacity=0.65,
                        popup=folium.Popup(popup, max_width=320),
                    ).add_to(fmap)
                st_folium(fmap, width=None, height=300, key="s2p_location_points_map")

            mc1, mc2 = st.columns(2)
            mc1.metric("Buildings", f"{summary.get('footprint_buildings', 0):,}")
            mc2.metric("EPC", f"{summary.get('epc_records', 0):,}")

            st.session_state["location_data_summary"] = summary
            st.session_state["location_classes"] = classes_df.to_dict("records")
            st.session_state["location_sample"] = sample_df.to_dict("records")

            # Building-level details (select from points currently plotted)
            if not points_df.empty:
                points_with_id = points_df.dropna(subset=["FormularId"]).copy()
                if not points_with_id.empty:
                    def _safe_id_text(v):
                        try:
                            return str(int(v))
                        except (TypeError, ValueError):
                            return "N/A"

                    points_with_id["_label"] = points_with_id.apply(
                        lambda r: (
                            f"{_safe_id_text(r.get('FormularId'))}"
                            + (f" · {r['address']}" if isinstance(r.get("address"), str) and r.get("address") else "")
                        ),
                        axis=1,
                    )
                    chosen = st.selectbox(
                        "Select a mapped building",
                        options=points_with_id["_label"].tolist()[:600],
                        key="s2p_selected_building",
                    )
                    selected_row = points_with_id[points_with_id["_label"] == chosen].iloc[0]
                    st.caption(
                        f"Data available: energy class={selected_row.get('energy_class')}, "
                        f"energy performance={selected_row.get('energy_performance')}, "
                        f"build year={selected_row.get('build_year')}, atemp={selected_row.get('atemp')}"
                    )

            with st.expander("Preview local data found near this location"):
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

    # SA button — only for RE Planning (we have data)
    if project_type == "Renewable Energy Planning":
        st.markdown(
            "<style>"
            "div[data-testid='stVerticalBlock']:has(#sa2p-btn) button "
            "{font-size:0.78rem!important; height:32px!important; "
            "padding:0 14px!important; min-height:0!important;}"
            "</style>"
            "<span id='sa2p-btn'></span>",
            unsafe_allow_html=True,
        )
        if st.button("Sensitivity Analysis", key="sa2p_dialog_btn",
                      help="View solar OAT sensitivity results"):
            show_re_sensitivity()

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
        with st.expander(f"{sys_name}  ({sys_items_count} inputs)", expanded=False):
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
        st.switch_page("pages/3_Analysis_Method.py")

with col4:
    st.markdown(
        "<div style='text-align:right; color:#94a3b8; font-size:0.85rem; "
        "padding-top:0.5rem;'>Step 2+ of 6</div>",
        unsafe_allow_html=True,
    )
