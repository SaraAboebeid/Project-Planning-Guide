"""
Page 2+: Review Data  (Step 1+ pipeline)

Project-type-driven data review page.
For **Renovation Planning** it falls through to the existing Step 2.
For **Energy Community Planning** and **Renewable Energy Planning** it
shows system-specific data inputs from config/step2plus_data_inputs.py
and the appropriate sensitivity analysis.
"""

import streamlit as st
from config.step2plus_data_inputs import get_ec_data_inputs, get_re_data_inputs, get_renovation_data_inputs
from config.sensitivity_config import (
    get_importance_rank, get_sensitivity_weight,
    SOLAR_OAT_PARAMETERS, SOLAR_OAT_IMPORTANCE, BASELINE_HEATING_KWH,
)
from config.data_inputs import get_proxy_confidence
from utils.shared_css import inject_shared_css, render_step_indicator

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

@st.dialog("Sensitivity Analysis — Renewable Energy", width="large")
def show_re_sensitivity():
    """Solar OAT sensitivity analysis for Renewable Energy Planning."""
    import plotly.graph_objects as go

    st.markdown(
        "<style>"
        "div[data-testid='stDialog'] section[data-testid='stVerticalBlockBorderWrapper'] "
        "{overflow-y:auto !important; max-height:80vh !important;}"
        "</style>",
        unsafe_allow_html=True,
    )
    st.markdown(
        "<p style='color:#64748b; font-size:0.92rem; margin-bottom:0.5rem;'>"
        "OAT sensitivity results from a solar analysis study. "
        "Parameters were varied one-at-a-time to measure their impact "
        "on annual heating demand (as a proxy for overall energy balance).</p>",
        unsafe_allow_html=True,
    )

    view = st.selectbox(
        "Visualisation",
        ["Tornado Chart", "Parameter Sweeps"],
        key="re_sa_view",
    )

    if view == "Tornado Chart":
        # Build tornado from SOLAR_OAT_PARAMETERS
        params = sorted(
            SOLAR_OAT_PARAMETERS.items(),
            key=lambda x: x[1]["range_kwh"],
        )
        labels = [v["label"] for _, v in params]
        ranges_mwh = [v["range_kwh"] / 1000 for _, v in params]

        fig = go.Figure(go.Bar(
            x=ranges_mwh, y=labels, orientation="h",
            marker_color="#33A9A0",
            text=[f"{r:.1f}" for r in ranges_mwh],
            textposition="outside",
        ))
        fig.add_vline(
            x=0, line_dash="dot", line_color="#94a3b8",
        )
        fig.update_layout(
            title="Solar OAT — Parameter Impact on Annual Heating (MWh/yr)",
            xaxis_title="Output Range (MWh/yr)",
            yaxis_title="",
            height=max(350, len(params) * 50),
            margin=dict(l=200, r=60, t=50, b=40),
            plot_bgcolor="white",
        )
        st.plotly_chart(fig, key="re_tornado", use_container_width=True)
        st.caption(
            "Bars show the total output range caused by varying each "
            "parameter across its full range."
        )

    elif view == "Parameter Sweeps":
        import plotly.subplots as sp

        params_list = list(SOLAR_OAT_PARAMETERS.items())
        n = len(params_list)
        ncols = 2
        nrows = (n + 1) // 2

        fig = sp.make_subplots(
            rows=nrows, cols=ncols,
            subplot_titles=[v["label"] for _, v in params_list],
            vertical_spacing=0.08,
        )
        for i, (name, data) in enumerate(params_list):
            r = i // ncols + 1
            c = i % ncols + 1
            vals = data["values"]
            outs = [o / 1000 for o in data["outputs_kwh"]]
            fig.add_trace(
                go.Scatter(
                    x=[str(v) for v in vals], y=outs,
                    mode="lines+markers", name=data["label"],
                    line=dict(color="#33528A", width=2),
                    marker=dict(size=6),
                    showlegend=False,
                ),
                row=r, col=c,
            )
            # Baseline marker
            bl = data.get("baseline_value")
            if bl is not None and bl in vals:
                idx = vals.index(bl)
                fig.add_trace(
                    go.Scatter(
                        x=[str(bl)], y=[outs[idx]],
                        mode="markers",
                        marker=dict(size=12, color="#dc2626", symbol="diamond"),
                        showlegend=False,
                    ),
                    row=r, col=c,
                )
        fig.update_layout(
            height=nrows * 250,
            margin=dict(l=60, r=30, t=40, b=30),
            plot_bgcolor="white",
        )
        st.plotly_chart(fig, key="re_sweeps", use_container_width=True)
        st.caption(
            "Line charts show how annual heating changes as each parameter "
            "varies. Diamond marks the baseline value."
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

left_col, right_col = st.columns([0.65, 0.35])

# ── Right: summary cards + SA button ────────────────────────────────
with right_col:
    st.markdown(
        f"""
        <div class='sticky-sidebar'>
          <div class='pg-card-stack'>
            <div class='pg-card' style='background:rgba(51,169,160,0.10); border:1px solid rgba(51,169,160,0.25);'>
              <div class='pg-val' style='color:#33A9A0;'>{avail}</div>
              <div class='pg-lbl'>Available Data</div>
            </div>
            <div class='pg-card' style='background:rgba(51,82,138,0.10); border:1px solid rgba(51,82,138,0.25);'>
              <div class='pg-val' style='color:#33528A;'>{miss}</div>
              <div class='pg-lbl'>Missing Data</div>
            </div>
            <div class='pg-card' style='background:rgba(138,182,46,0.10); border:1px solid rgba(138,182,46,0.25);'>
              <div class='pg-val' style='color:#8AB62E;'>{avg_display}</div>
              <div class='pg-lbl'>Avg. Proxy Confidence</div>
            </div>
          </div>
        </div>
        """,
        unsafe_allow_html=True,
    )

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
    elif project_type == "Energy Community Planning":
        st.caption("Sensitivity analysis for Energy Community will be available soon.")

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
col1, col2, col3 = st.columns([1, 1, 2])

with col1:
    if st.button("Back", use_container_width=True, key="s2p_back"):
        st.switch_page("pages/0_Define_Project.py")

with col2:
    if st.button("Continue", type="primary", use_container_width=True, key="s2p_next"):
        st.switch_page("pages/3_Analysis_Method.py")

with col3:
    st.markdown(
        "<div style='text-align:right; color:#94a3b8; font-size:0.85rem; "
        "padding-top:0.5rem;'>Step 2+ of 6</div>",
        unsafe_allow_html=True,
    )
