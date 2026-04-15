"""
Page 4+: Options, Climate & Cost Recommendation  (Renovation Planning pipeline)

Combines Boverket material browser, GWP analysis, ranked alternatives,
scenario builder (A/B/C), comparison charts, and sensitivity tornado —
all in a single streamlined page for renovation material selection.
"""

import streamlit as st
import pandas as pd
import plotly.graph_objects as go
from utils.shared_css import inject_shared_css, render_step_indicator, render_branded_top_bar, render_top_cards
from utils.boverket_api import (
    get_latest_version as boverket_latest_version,
    get_resources_for_component as boverket_resources_for_component,
    resource_summary as boverket_resource_summary,
    RENOVATION_COMPONENTS,
)

st.set_page_config(page_title="Recommendations (Step 4+)", layout="wide")
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
    st.warning("Please complete the previous steps first.")
    if st.button("Go to Step 1+"):
        st.switch_page("pages/0_Define_Project.py")
    st.stop()

if project_type != "Renovation Planning":
    st.warning("Step 4+ is for Renovation Planning only.")
    if st.button("Back"):
        st.switch_page("pages/3_Analysis_Method.py")
    st.stop()

# ============================================================================
# HEADER
# ============================================================================

render_branded_top_bar(
    "Step 4+: Options, Climate & Cost",
    "Browse materials from Boverket Klimatdatabas, compare GWP across renovation "
    "components, build scenarios, and get recommendations.",
)
render_step_indicator(4)

# ============================================================================
# GATHER CONTEXT
# ============================================================================

reno_envelope = st.session_state.get("renovation_envelope_components", [])
comp_details = st.session_state.get("renovation_component_details", {})
assumptions = st.session_state.get("renovation_assumptions", {})
tabula_archetype = st.session_state.get("tabula_archetype")
epc_tabula_delta = st.session_state.get("epc_tabula_delta")

_valid_components = [c for c in reno_envelope if c in RENOVATION_COMPONENTS]
if not _valid_components:
    st.warning(
        "No valid renovation components selected. "
        "Go back to Step 1+ to select envelope components."
    )
    if st.button("Back to Step 1+"):
        st.switch_page("pages/0_Define_Project.py")
    st.stop()

# ============================================================================
# BOVERKET DATA LOADING
# ============================================================================

_bov_version = boverket_latest_version()

if not _bov_version:
    st.warning("Could not reach Boverket Klimatdatabas API — material data unavailable.")
    st.stop()

st.markdown(
    f"<div style='font-size:0.78rem; color:#64748b; margin-bottom:0.6rem;'>"
    f"Database version <b>{_bov_version}</b> · "
    f"Showing materials for <b>{len(_valid_components)}</b> renovation component(s) · "
    f"<a href='https://api-portal.boverket.se/reference#api=klimatdatabas' "
    f"target='_blank' style='color:#8AB62E;'>API docs ↗</a></div>",
    unsafe_allow_html=True,
)

# Collect data for all components
_comp_data: dict[str, pd.DataFrame] = {}
for _comp in _valid_components:
    _resources = boverket_resources_for_component(
        _comp, version=_bov_version, culture="en"
    )
    _rows = []
    for _r in _resources:
        _s = boverket_resource_summary(_r)
        gwp_min = _s.get("GWP Min (Typ+A4+A5)")
        gwp_max = _s.get("GWP Max (Cons+A4+A5)")
        if isinstance(gwp_min, (int, float)) and isinstance(gwp_max, (int, float)):
            _rows.append(_s)
    if _rows:
        _comp_data[_comp] = pd.DataFrame(_rows)

if not _comp_data:
    st.info("No materials with complete GWP data found for the selected components.")
    st.stop()

# ============================================================================
# TOP CARDS
# ============================================================================

_total_materials = sum(len(df) for df in _comp_data.values())
render_top_cards([
    {
        "value": str(len(_comp_data)),
        "label": "Components",
        "color": "#33A9A0",
        "bg": "rgba(51,169,160,0.10)",
        "border": "rgba(51,169,160,0.25)",
    },
    {
        "value": str(_total_materials),
        "label": "Materials Available",
        "color": "#33528A",
        "bg": "rgba(51,82,138,0.10)",
        "border": "rgba(51,82,138,0.25)",
    },
    {
        "value": _bov_version,
        "label": "Boverket Version",
        "color": "#8AB62E",
        "bg": "rgba(138,182,46,0.10)",
        "border": "rgba(138,182,46,0.25)",
    },
])

# ============================================================================
# 1. MATERIAL BROWSER — per component with filter + GWP toggle
# ============================================================================

st.markdown(
    "<div style='font-size:1.08rem; font-weight:700; color:#334155; "
    "margin:0.5rem 0 0.4rem;'>🌱 Material Browser</div>",
    unsafe_allow_html=True,
)
st.caption(
    "Browse building materials from Boverket Klimatdatabas for each renovation component. "
    "GWP values in **kg CO₂ eq.** per declared unit."
)

bov_view_mode = st.radio(
    "View as:",
    options=["Total GWP Range", "A1-A3 Typical Module"],
    horizontal=True,
    key="s4p_bov_view_mode",
    help="Total GWP Range: min/max lifecycle impact. A1-A3 Typical: production phase only.",
)

_browse_tabs = st.tabs([f"📦 {c}" for c in _comp_data])
for _tab, (_comp_name, _df) in zip(_browse_tabs, _comp_data.items()):
    with _tab:
        _search = st.text_input(
            "🔍 Filter", key=f"s4p_search_{_comp_name}",
            placeholder=f"Filter {_comp_name.lower()} materials…",
        )
        _display_df = _df.copy()
        if _search:
            _display_df = _display_df[
                _display_df["Name"].str.contains(_search, case=False, na=False)
            ]

        if bov_view_mode == "Total GWP Range":
            col_order = [
                "Name", "Unit",
                "GWP Max (Cons+A4+A5)", "GWP Min (Typ+A4+A5)",
                "Density / Conversion", "Waste Factor",
            ]
            col_config = {
                "GWP Max (Cons+A4+A5)": st.column_config.NumberColumn(
                    "GWP Max (kg CO₂ eq.)", format="%.4f",
                ),
                "GWP Min (Typ+A4+A5)": st.column_config.NumberColumn(
                    "GWP Min (kg CO₂ eq.)", format="%.4f",
                ),
            }
        else:
            col_order = [
                "Name", "Unit",
                "GWP A1-A3 (Typical)",
                "Density / Conversion", "Waste Factor",
            ]
            col_config = {
                "GWP A1-A3 (Typical)": st.column_config.NumberColumn(
                    "GWP A1-A3 Typical (kg CO₂ eq.)", format="%.4f",
                ),
            }

        col_order = [c for c in col_order if c in _display_df.columns]
        _display_df = _display_df[col_order]

        st.markdown(
            f"<div style='font-size:0.82rem; color:#64748b; margin-bottom:0.3rem;'>"
            f"<b>{len(_display_df)}</b> materials for <b>{_comp_name}</b></div>",
            unsafe_allow_html=True,
        )
        st.dataframe(
            _display_df,
            use_container_width=True,
            hide_index=True,
            height=min(380, 38 + len(_display_df) * 35),
            column_config=col_config,
        )

# ============================================================================
# 2. GWP RANGE COMPARISON — per component
# ============================================================================

st.markdown(
    "<hr style='margin:1.2rem 0; border:none; border-top:1px solid #e2e8f0;'>",
    unsafe_allow_html=True,
)
st.markdown(
    "<div style='font-size:1.08rem; font-weight:700; color:#334155; "
    "margin:0.5rem 0 0.4rem;'>📊 Climate Impact Range by Component</div>",
    unsafe_allow_html=True,
)
st.caption(
    "Materials sorted by lowest GWP (best first). "
    "Green = typical production + transport + install. "
    "Dark overlay = additional to conservative estimate."
)

_range_tabs = st.tabs([f"📦 {c}" for c in _comp_data])
for _tab, (_comp_name, _df) in zip(_range_tabs, _comp_data.items()):
    with _tab:
        _df_s = _df.sort_values("GWP Min (Typ+A4+A5)").head(20).copy()
        _df_s["_range"] = (
            _df_s["GWP Max (Cons+A4+A5)"]
            - _df_s["GWP Min (Typ+A4+A5)"]
        )
        _fig = go.Figure()
        _fig.add_trace(go.Bar(
            y=_df_s["Name"], x=_df_s["GWP Min (Typ+A4+A5)"],
            orientation="h", marker_color="#8AB62E",
            name="GWP Min (Typical)",
            text=_df_s["GWP Min (Typ+A4+A5)"].apply(lambda v: f"{v:.4f}"),
            textposition="inside",
        ))
        _fig.add_trace(go.Bar(
            y=_df_s["Name"], x=_df_s["_range"],
            orientation="h", marker_color="rgba(89,112,1,0.35)",
            name="Additional (→ Conservative)",
            text=_df_s["GWP Max (Cons+A4+A5)"].apply(lambda v: f"max {v:.4f}"),
            textposition="inside",
        ))
        _fig.update_layout(
            barmode="stack",
            title=f"{_comp_name} — Top {len(_df_s)} by Lowest GWP",
            xaxis_title="kg CO₂ eq. per declared unit",
            yaxis=dict(autorange="reversed"),
            height=max(350, len(_df_s) * 32 + 80),
            margin=dict(l=10, r=20, t=50, b=40),
            legend=dict(orientation="h", y=-0.15),
            font=dict(family="Inter, sans-serif"),
        )
        st.plotly_chart(_fig, use_container_width=True, key=f"s4p_gwp_{_comp_name}")

# ============================================================================
# 3. RANKED ALTERNATIVES — top 3 per component
# ============================================================================

st.markdown(
    "<div style='font-size:1.08rem; font-weight:700; color:#334155; "
    "margin:1.2rem 0 0.4rem;'>🏆 Top 3 Lowest-GWP Alternatives per Component</div>",
    unsafe_allow_html=True,
)

_rank_rows = []
for _comp_name, _df in _comp_data.items():
    _top = _df.nsmallest(3, "GWP Min (Typ+A4+A5)")
    for _rk, (_, _row) in enumerate(_top.iterrows(), 1):
        _rank_rows.append({
            "Component": _comp_name,
            "#": _rk,
            "Material": _row["Name"],
            "Unit": _row["Unit"],
            "GWP Min": round(_row["GWP Min (Typ+A4+A5)"], 5),
            "GWP Max": round(_row["GWP Max (Cons+A4+A5)"], 5),
        })

if _rank_rows:
    st.dataframe(
        pd.DataFrame(_rank_rows),
        use_container_width=True,
        hide_index=True,
        column_config={
            "#": st.column_config.NumberColumn(width="small"),
            "GWP Min": st.column_config.NumberColumn(
                "GWP Min (kg CO₂ eq.)", format="%.5f",
            ),
            "GWP Max": st.column_config.NumberColumn(
                "GWP Max (kg CO₂ eq.)", format="%.5f",
            ),
        },
    )

# ============================================================================
# 4. SCENARIO BUILDER — pick one material per component
# ============================================================================

st.markdown(
    "<hr style='margin:1.2rem 0; border:none; border-top:1px solid #e2e8f0;'>",
    unsafe_allow_html=True,
)
st.markdown(
    "<div style='font-size:1.08rem; font-weight:700; color:#334155; "
    "margin:0.5rem 0 0.4rem;'>⚖️ Scenario Builder — Compare Material Choices</div>",
    unsafe_allow_html=True,
)
st.caption(
    "Select one material per component to build a renovation scenario. "
    "The chart compares your selection against best-case and worst-case."
)

_user_sc = {}
_best_sc = {}
_worst_sc = {}

_sel_cols = st.columns(min(len(_comp_data), 3))
for _idx, (_comp_name, _df) in enumerate(_comp_data.items()):
    with _sel_cols[_idx % len(_sel_cols)]:
        _sorted_df = _df.sort_values("GWP Min (Typ+A4+A5)")
        _options = _sorted_df["Name"].tolist()
        _sel = st.selectbox(
            _comp_name, options=_options, index=0,
            key=f"s4p_scenario_{_comp_name}",
        )
        _sel_row = _sorted_df[_sorted_df["Name"] == _sel].iloc[0]
        _user_sc[_comp_name] = _sel_row["GWP Min (Typ+A4+A5)"]
        _best_sc[_comp_name] = _sorted_df.iloc[0]["GWP Min (Typ+A4+A5)"]
        _worst_sc[_comp_name] = _sorted_df.iloc[-1]["GWP Min (Typ+A4+A5)"]

# Save selections to session state
st.session_state["renovation_scenario_selections"] = {
    c: st.session_state.get(f"s4p_scenario_{c}") for c in _comp_data
}

# Comparison chart
_sc_comps = list(_comp_data.keys())
_fig_sc = go.Figure()
_fig_sc.add_trace(go.Bar(
    x=_sc_comps,
    y=[_best_sc[c] for c in _sc_comps],
    name="Best Case", marker_color="#33A9A0",
))
_fig_sc.add_trace(go.Bar(
    x=_sc_comps,
    y=[_user_sc[c] for c in _sc_comps],
    name="Your Selection", marker_color="#33528A",
))
_fig_sc.add_trace(go.Bar(
    x=_sc_comps,
    y=[_worst_sc[c] for c in _sc_comps],
    name="Worst Case", marker_color="#597001", opacity=0.6,
))
_fig_sc.update_layout(
    barmode="group",
    title="Scenario Comparison — GWP per Declared Unit",
    yaxis_title="kg CO₂ eq.",
    height=420,
    font=dict(family="Inter, sans-serif"),
    legend=dict(orientation="h", y=-0.18),
)
st.plotly_chart(_fig_sc, use_container_width=True, key="s4p_scenario_chart")

# Per-component delta badges
_badge_cols = st.columns(len(_sc_comps))
for _bc, _comp_name in zip(_badge_cols, _sc_comps):
    with _bc:
        _delta = _user_sc[_comp_name] - _best_sc[_comp_name]
        if _delta < 1e-6:
            _bc_color, _bc_bg = "#33A9A0", "rgba(51,169,160,0.12)"
            _bc_text = "✔ Best option"
        else:
            _bc_color, _bc_bg = "#33528A", "rgba(51,82,138,0.10)"
            _bc_text = f"+{_delta:.5f} vs best"
        st.markdown(
            f"<div style='text-align:center; padding:0.5rem 0.4rem; "
            f"border-radius:10px; background:{_bc_bg}; "
            f"border:1px solid {_bc_color}20;'>"
            f"<div style='font-weight:700; font-size:0.82rem; "
            f"color:{_bc_color};'>{_comp_name}</div>"
            f"<div style='font-size:0.78rem; color:#64748b;'>"
            f"{_bc_text}</div></div>",
            unsafe_allow_html=True,
        )

# ============================================================================
# 5. SENSITIVITY TORNADO — which component matters most
# ============================================================================

st.markdown(
    "<hr style='margin:1.2rem 0; border:none; border-top:1px solid #e2e8f0;'>",
    unsafe_allow_html=True,
)
st.markdown(
    "<div style='font-size:1.08rem; font-weight:700; color:#334155; "
    "margin:0.5rem 0 0.4rem;'>🌪️ Sensitivity — Which Component Matters Most?</div>",
    unsafe_allow_html=True,
)
st.caption(
    "Shows how much GWP varies within each component. "
    "Wider bars = more opportunity to reduce climate impact through material choice."
)

_sens_rows = []
for _comp_name, _df in _comp_data.items():
    _col = "GWP Min (Typ+A4+A5)"
    _b = _df[_col].min()
    _w = _df[_col].max()
    _m = _df[_col].median()
    _sens_rows.append({
        "Component": _comp_name,
        "Best": _b, "Median": _m, "Worst": _w,
        "Range": _w - _b,
        "Range %": ((_w - _b) / _m * 100) if _m > 0 else 0,
        "N Materials": len(_df),
    })

_sens_df = pd.DataFrame(_sens_rows).sort_values("Range", ascending=True)

_fig_t = go.Figure()
_fig_t.add_trace(go.Bar(
    y=_sens_df["Component"],
    x=-(_sens_df["Median"] - _sens_df["Best"]),
    orientation="h", marker_color="#8AB62E",
    name="Improvement potential (→ best)",
    text=_sens_df.apply(
        lambda r: f"−{r['Median'] - r['Best']:.4f}", axis=1
    ),
    textposition="inside",
))
_fig_t.add_trace(go.Bar(
    y=_sens_df["Component"],
    x=_sens_df["Worst"] - _sens_df["Median"],
    orientation="h", marker_color="#597001",
    name="Risk (→ worst)",
    text=_sens_df.apply(
        lambda r: f"+{r['Worst'] - r['Median']:.4f}", axis=1
    ),
    textposition="inside",
))
_fig_t.update_layout(
    title="Tornado Chart — GWP Variation from Median",
    xaxis_title="Δ kg CO₂ eq. from median (per declared unit)",
    barmode="relative",
    height=max(300, len(_sens_df) * 55 + 80),
    font=dict(family="Inter, sans-serif"),
    legend=dict(orientation="h", y=-0.2),
)
st.plotly_chart(_fig_t, use_container_width=True, key="s4p_tornado")

# Sensitivity summary table
st.dataframe(
    _sens_df[["Component", "N Materials", "Best", "Median",
              "Worst", "Range", "Range %"]],
    use_container_width=True,
    hide_index=True,
    column_config={
        "Best": st.column_config.NumberColumn(format="%.5f"),
        "Median": st.column_config.NumberColumn(format="%.5f"),
        "Worst": st.column_config.NumberColumn(format="%.5f"),
        "Range": st.column_config.NumberColumn(format="%.5f"),
        "Range %": st.column_config.NumberColumn(format="%.0f%%"),
    },
)

# ============================================================================
# 6. AREA-WEIGHTED TOTAL GWP (if areas from Step 3+ are available)
# ============================================================================

if comp_details:
    _has_areas = any(
        comp_details.get(c, {}).get("area_m2", 0) > 0 for c in _comp_data
    )
    if _has_areas:
        st.markdown(
            "<hr style='margin:1.2rem 0; border:none; border-top:1px solid #e2e8f0;'>",
            unsafe_allow_html=True,
        )
        st.markdown(
            "<div style='font-size:1.08rem; font-weight:700; color:#334155; "
            "margin:0.5rem 0 0.4rem;'>📐 Area-Weighted GWP Estimate</div>",
            unsafe_allow_html=True,
        )
        st.caption(
            "Uses component areas from Step 3+ to estimate total renovation GWP. "
            "This is a simplified estimate — actual totals depend on material quantities."
        )

        _weighted_rows = []
        _total_best = 0.0
        _total_user = 0.0
        _total_worst = 0.0

        for _comp_name in _comp_data:
            _area = comp_details.get(_comp_name, {}).get("area_m2", 0.0)
            if _area > 0:
                _w_best = _best_sc.get(_comp_name, 0) * _area
                _w_user = _user_sc.get(_comp_name, 0) * _area
                _w_worst = _worst_sc.get(_comp_name, 0) * _area
                _total_best += _w_best
                _total_user += _w_user
                _total_worst += _w_worst
                _weighted_rows.append({
                    "Component": _comp_name,
                    "Area (m²)": _area,
                    "GWP/unit (selected)": _user_sc.get(_comp_name, 0),
                    "Total GWP (selected)": round(_w_user, 2),
                    "Total GWP (best)": round(_w_best, 2),
                    "Total GWP (worst)": round(_w_worst, 2),
                })

        if _weighted_rows:
            st.dataframe(
                pd.DataFrame(_weighted_rows),
                use_container_width=True,
                hide_index=True,
                column_config={
                    "GWP/unit (selected)": st.column_config.NumberColumn(format="%.5f"),
                    "Total GWP (selected)": st.column_config.NumberColumn(
                        "Total GWP kg CO₂ eq.", format="%.2f",
                    ),
                    "Total GWP (best)": st.column_config.NumberColumn(format="%.2f"),
                    "Total GWP (worst)": st.column_config.NumberColumn(format="%.2f"),
                },
            )

            # Summary cards
            _wc1, _wc2, _wc3 = st.columns(3)
            with _wc1:
                st.markdown(
                    f"<div style='background:rgba(51,169,160,0.10); border:1px solid rgba(51,169,160,0.25); "
                    f"border-radius:12px; padding:0.7rem; text-align:center;'>"
                    f"<div style='font-size:0.7rem; color:#64748b;'>Best Case Total</div>"
                    f"<div style='font-size:1.2rem; font-weight:800; color:#33A9A0;'>"
                    f"{_total_best:,.1f}</div>"
                    f"<div style='font-size:0.65rem; color:#94a3b8;'>kg CO₂ eq.</div></div>",
                    unsafe_allow_html=True,
                )
            with _wc2:
                st.markdown(
                    f"<div style='background:rgba(51,82,138,0.10); border:1px solid rgba(51,82,138,0.25); "
                    f"border-radius:12px; padding:0.7rem; text-align:center;'>"
                    f"<div style='font-size:0.7rem; color:#64748b;'>Your Selection</div>"
                    f"<div style='font-size:1.2rem; font-weight:800; color:#33528A;'>"
                    f"{_total_user:,.1f}</div>"
                    f"<div style='font-size:0.65rem; color:#94a3b8;'>kg CO₂ eq.</div></div>",
                    unsafe_allow_html=True,
                )
            with _wc3:
                st.markdown(
                    f"<div style='background:rgba(89,112,1,0.10); border:1px solid rgba(89,112,1,0.25); "
                    f"border-radius:12px; padding:0.7rem; text-align:center;'>"
                    f"<div style='font-size:0.7rem; color:#64748b;'>Worst Case Total</div>"
                    f"<div style='font-size:1.2rem; font-weight:800; color:#597001;'>"
                    f"{_total_worst:,.1f}</div>"
                    f"<div style='font-size:0.65rem; color:#94a3b8;'>kg CO₂ eq.</div></div>",
                    unsafe_allow_html=True,
                )

# ============================================================================
# NAVIGATION
# ============================================================================

st.markdown("---")
col1, col2, col3, col4 = st.columns([1, 1, 1, 2])

with col1:
    if st.button("Home", key="s4p_home"):
        st.switch_page("planning_guide.py")

with col2:
    if st.button("Back", key="s4p_back"):
        st.switch_page("pages/3plus_Data_Inputs.py")

with col3:
    if st.button("Continue", type="primary", key="s4p_next"):
        st.switch_page("pages/4_Expected_Results.py")

with col4:
    st.markdown(
        "<div style='text-align:right; color:#94a3b8; font-size:0.85rem; "
        "padding-top:0.5rem;'>Step 4+ of 7</div>",
        unsafe_allow_html=True,
    )
