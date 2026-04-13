"""
Page 6: Cost

CAPEX/OPEX budget estimation and cost summary.
"""

import streamlit as st
import pandas as pd
import plotly.express as px
from config.data_inputs import get_data_inputs
from utils.shared_css import inject_shared_css, render_step_indicator, render_top_cards

st.set_page_config(page_title="Cost", layout="wide")

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
render_step_indicator(6)

is_plus_mode = st.session_state.get("pipeline_mode") == "step1plus"
step1_page = "pages/0_Define_Project.py" if is_plus_mode else "pages/1_Define_Scope_and_Context.py"

# ============================================================================
# CONSTANTS
# ============================================================================

CONSULTANT_RATES = {
    "USD": 150.0,
    "EUR": 140.0,
    "GBP": 130.0,
    "SEK": 1400.0,
    "NOK": 1500.0,
    "DKK": 1050.0,
}

EFFORT_BASE = {
    "Energy & Carbon Performance": 60,
    "Renewable Energy & Local Production": 50,
    "Climate Resilience": 70,
    "Retrofit & Transformation": 65,
    "Urban Design Support": 55,
    "Infrastructure Planning": 60,
    "Equity & Social Impact": 50,
}
SCALE_MULT = {"Building": 1.0, "Neighborhood": 1.8, "City": 2.5}

PHASE_SPLIT = {
    "Scoping": 0.10,
    "Data Collection": 0.30,
    "Modeling & Simulation": 0.35,
    "Validation & QA": 0.15,
    "Reporting": 0.10,
}


# ============================================================================
# CHECK PREREQUISITES
# ============================================================================

if "analysis_type" not in st.session_state or not st.session_state.analysis_type:
    st.warning("Please complete Step 1 first.")
    if st.button("Go to Step 1"):
        st.switch_page(step1_page)
    st.stop()

# ============================================================================
# GET SESSION STATE
# ============================================================================

analysis_type = st.session_state.get("analysis_type", [])
if isinstance(analysis_type, str):
    analysis_type = [analysis_type]
analysis_type_str = analysis_type[0] if analysis_type else "None"

analysis_focus = st.session_state.get("analysis_focus") or st.session_state.get("energy_system_focus", "")
analysis_scale = st.session_state.get("analysis_scale") or st.session_state.get("project_scale", "Building")
analysis_context = st.session_state.get("analysis_context") or st.session_state.get("country", "")
renewable_types = st.session_state.get("renewable_types", [])
urban_design_types = st.session_state.get("urban_design_types", [])
climate_resilience_types = st.session_state.get("climate_resilience_types", [])

# ============================================================================
# EFFORT ESTIMATION
# ============================================================================

data_inputs = get_data_inputs(
    analysis_type, analysis_focus, analysis_scale, analysis_context,
    renewable_types, urban_design_types, climate_resilience_types
)

# ── Read persisted choices from Step 2 ──────────────────────────────
step2_choices = st.session_state.get("step2_data_choices", {})

all_items = []
for cat in (data_inputs or []):
    all_items.extend(cat["items"])
total_count = len(all_items)

available_count = 0
proxies_count = 0
for item in all_items:
    choice = step2_choices.get(item["key"], {})
    has_data = choice.get("has_data", "Yes")
    if has_data == "Yes":
        available_count += 1
    else:
        proxy = choice.get("proxy")
        if proxy:
            proxies_count += 1

data_coverage_pct = (available_count / total_count * 100) if total_count > 0 else 0

base_hours = EFFORT_BASE.get(analysis_type_str, 55)
scale_mult = SCALE_MULT.get(analysis_scale, 1.0)
completeness_mult = 1.0 + (1.0 - data_coverage_pct / 100.0) * 0.7
proxy_mult = 1.0 + proxies_count * 0.03
total_hours = round(base_hours * scale_mult * completeness_mult * proxy_mult)
duration_weeks = max(1, round(total_hours / 30))

# ============================================================================
# INITIALIZE SESSION STATE
# ============================================================================

if "p6_currency" not in st.session_state:
    st.session_state.p6_currency = "SEK"
if "p6_consultant_rate" not in st.session_state:
    st.session_state.p6_consultant_rate = CONSULTANT_RATES.get("SEK", 1400.0)

# CAPEX defaults
for key in ["p6_capex_construction", "p6_capex_design", "p6_capex_permits",
            "p6_capex_equipment", "p6_contingency_pct"]:
    if key not in st.session_state:
        st.session_state[key] = 10 if key == "p6_contingency_pct" else 0.0

# OPEX defaults
for key in ["p6_opex_energy", "p6_opex_maintenance", "p6_opex_staffing", "p6_opex_other"]:
    if key not in st.session_state:
        st.session_state[key] = 0.0

# ============================================================================
# PAGE HEADER
# ============================================================================

st.markdown(
    "<h2 style='font-size:1.5rem; font-weight:700; color:#0f172a; letter-spacing:-0.01em; margin-bottom:0.5rem;'>"
    "Step 6: Tasks & Cost</h2>",
    unsafe_allow_html=True
)
st.markdown(
    "<p style='font-size:0.92rem; color:#64748b; margin-top:-0.5rem; margin-bottom:0.7rem;'>"
    "Estimate consultant costs and set your project budget.</p>",
    unsafe_allow_html=True
)

# Context bar
context_info = f"<span style='font-size:0.88rem; color:#475569;'><b>Analysis:</b> {analysis_type_str}"
if analysis_focus:
    context_info += f" / <b>{analysis_focus}</b>"
if analysis_scale:
    context_info += f" | <b>Scale:</b> {analysis_scale}"
if analysis_context:
    context_info += f" | <b>Context:</b> {analysis_context}"
context_info += "</span>"
st.markdown(context_info, unsafe_allow_html=True)

# ============================================================================
# COMPUTE EFFECTIVE VALUES
# ============================================================================

effective_hours = total_hours
effective_weeks = max(1, round(effective_hours / 30))

# Service cost
rate = st.session_state.p6_consultant_rate
overhead_mult = 1.10
service_cost = round(effective_hours * rate * overhead_mult, 2)
currency = st.session_state.p6_currency

# ============================================================================
# SUMMARY CARDS
# ============================================================================

render_top_cards([
    {"value": f"{service_cost:,.0f} {currency}", "label": "Estimated Service Cost",
     "color": "#33528A", "bg": "rgba(51,82,138,0.10)", "border": "rgba(51,82,138,0.25)"},
    {"value": f"{effective_hours} hrs", "label": "Estimated Hours",
     "color": "#33A9A0", "bg": "rgba(51,169,160,0.10)", "border": "rgba(51,169,160,0.25)"},
    {"value": f"{effective_weeks} wk", "label": "Duration",
     "color": "#8AB62E", "bg": "rgba(138,182,46,0.10)", "border": "rgba(138,182,46,0.25)"},
])

# ============================================================================
# COST & BUDGET
# ============================================================================

st.markdown(
    "<hr style='margin: 1.5rem 0 1rem 0; border: none; border-top: 1px solid #e2e8f0;'>",
    unsafe_allow_html=True
)
st.markdown(
    "<div style='font-size:1.02rem; font-weight:600; margin-bottom:0.5rem;'>"
    "Cost and Budget</div>",
    unsafe_allow_html=True
)

# ── Consultant cost inputs ──
cost_col1, cost_col2 = st.columns(2)
with cost_col1:
    st.session_state.p6_currency = st.selectbox(
        "Currency",
        options=list(CONSULTANT_RATES.keys()),
        index=list(CONSULTANT_RATES.keys()).index(st.session_state.p6_currency),
        key="p6_currency_select"
    )
with cost_col2:
    default_rate = CONSULTANT_RATES.get(st.session_state.p6_currency, 150.0)
    if st.session_state.p6_consultant_rate == 0:
        st.session_state.p6_consultant_rate = default_rate
    st.session_state.p6_consultant_rate = st.number_input(
        "Consultant Hourly Rate",
        min_value=0.0,
        value=float(st.session_state.p6_consultant_rate),
        key="p6_rate_input"
    )

# Recompute service cost after inputs
rate = st.session_state.p6_consultant_rate
service_cost = round(effective_hours * rate * overhead_mult, 2)

# ── Auto-estimated service cost ──
st.markdown(
    f"<div style='background:rgba(51,169,160,0.05); border-left:3px solid #33A9A0; "
    f"padding:0.8rem 1rem; border-radius:8px; margin:0.5rem 0 1rem 0;'>"
    f"<div style='font-size:0.9rem; color:#64748b;'>Estimated Service Cost "
    f"({effective_hours} hrs × {rate:,.0f} {st.session_state.p6_currency}/hr × 1.10 overhead)</div>"
    f"<div style='font-size:1.3rem; font-weight:700; color:#33528A;'>"
    f"{service_cost:,.0f} {st.session_state.p6_currency}</div>"
    f"</div>",
    unsafe_allow_html=True
)

# ── CAPEX ──
st.markdown(
    "<div style='font-size:1.02rem; font-weight:600; margin:0.8rem 0 0.3rem 0;'>CAPEX (Capital Expenditure)</div>",
    unsafe_allow_html=True
)

capex_col1, capex_col2 = st.columns(2)
with capex_col1:
    st.session_state.p6_capex_construction = st.number_input(
        "Construction", min_value=0.0,
        value=float(st.session_state.p6_capex_construction),
        key="p6_capex_constr"
    )
    st.session_state.p6_capex_design = st.number_input(
        "Design & Engineering", min_value=0.0,
        value=float(st.session_state.p6_capex_design),
        key="p6_capex_des"
    )
with capex_col2:
    st.session_state.p6_capex_permits = st.number_input(
        "Permits & Approvals", min_value=0.0,
        value=float(st.session_state.p6_capex_permits),
        key="p6_capex_perm"
    )
    st.session_state.p6_capex_equipment = st.number_input(
        "Equipment & Materials", min_value=0.0,
        value=float(st.session_state.p6_capex_equipment),
        key="p6_capex_equip"
    )

st.session_state.p6_contingency_pct = st.slider(
    "Contingency (%)", min_value=0, max_value=30,
    value=int(st.session_state.p6_contingency_pct),
    key="p6_contingency_slider"
)

capex_base = (
    st.session_state.p6_capex_construction +
    st.session_state.p6_capex_design +
    st.session_state.p6_capex_permits +
    st.session_state.p6_capex_equipment
)
capex_total = capex_base * (1 + st.session_state.p6_contingency_pct / 100.0)

# ── OPEX ──
st.markdown(
    "<div style='font-size:1.02rem; font-weight:600; margin:0.8rem 0 0.3rem 0;'>OPEX (Annual Operating Expenditure)</div>",
    unsafe_allow_html=True
)

opex_col1, opex_col2 = st.columns(2)
with opex_col1:
    st.session_state.p6_opex_energy = st.number_input(
        "Energy & Utilities (annual)", min_value=0.0,
        value=float(st.session_state.p6_opex_energy),
        key="p6_opex_en"
    )
    st.session_state.p6_opex_maintenance = st.number_input(
        "Maintenance (annual)", min_value=0.0,
        value=float(st.session_state.p6_opex_maintenance),
        key="p6_opex_maint"
    )
with opex_col2:
    st.session_state.p6_opex_staffing = st.number_input(
        "Staffing (annual)", min_value=0.0,
        value=float(st.session_state.p6_opex_staffing),
        key="p6_opex_staff"
    )
    st.session_state.p6_opex_other = st.number_input(
        "Other OPEX (annual)", min_value=0.0,
        value=float(st.session_state.p6_opex_other),
        key="p6_opex_oth"
    )

opex_total = (
    st.session_state.p6_opex_energy +
    st.session_state.p6_opex_maintenance +
    st.session_state.p6_opex_staffing +
    st.session_state.p6_opex_other
)

# ============================================================================
# COST SUMMARY CARDS
# ============================================================================

st.markdown(
    "<hr style='margin: 1rem 0; border: none; border-top: 1px solid #e2e8f0;'>",
    unsafe_allow_html=True
)

cur = st.session_state.p6_currency

summary_html = f"""
<div style="display:flex; gap:1.2rem; margin:1.2rem 0 1.5rem 0;">
    <div style="flex:1 1 0; border-radius:14px; padding:1.1rem 1.4rem; display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:100px; box-shadow:0 1px 4px rgba(0,0,0,0.06); background:rgba(51,82,138,0.10); border:1px solid rgba(51,82,138,0.25);">
        <div style="font-size:1.5rem; font-weight:700; color:#33528A; margin-bottom:0.2rem;">{capex_total:,.0f} {cur}</div>
        <div style="font-size:0.88rem; font-weight:500; color:#6b7280;">CAPEX (with {st.session_state.p6_contingency_pct}% contingency)</div>
    </div>
    <div style="flex:1 1 0; border-radius:14px; padding:1.1rem 1.4rem; display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:100px; box-shadow:0 1px 4px rgba(0,0,0,0.06); background:rgba(51,169,160,0.10); border:1px solid rgba(51,169,160,0.25);">
        <div style="font-size:1.5rem; font-weight:700; color:#33A9A0; margin-bottom:0.2rem;">{opex_total:,.0f} {cur}</div>
        <div style="font-size:0.88rem; font-weight:500; color:#6b7280;">Annual OPEX</div>
    </div>
    <div style="flex:1 1 0; border-radius:14px; padding:1.1rem 1.4rem; display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:100px; box-shadow:0 1px 4px rgba(0,0,0,0.06); background:rgba(138,182,46,0.10); border:1px solid rgba(138,182,46,0.25);">
        <div style="font-size:1.5rem; font-weight:700; color:#8AB62E; margin-bottom:0.2rem;">{st.session_state.p6_contingency_pct}%</div>
        <div style="font-size:0.88rem; font-weight:500; color:#6b7280;">Contingency</div>
    </div>
</div>
"""
st.markdown(summary_html, unsafe_allow_html=True)

# ============================================================================
# CAPEX PIE CHART
# ============================================================================

if capex_base > 0:
    contingency_amount = capex_total - capex_base
    breakdown_df = pd.DataFrame({
        "Category": ["Construction", "Design & Engineering", "Permits", "Equipment", "Contingency"],
        "Amount": [
            st.session_state.p6_capex_construction,
            st.session_state.p6_capex_design,
            st.session_state.p6_capex_permits,
            st.session_state.p6_capex_equipment,
            contingency_amount,
        ]
    })
    # Remove zero entries
    breakdown_df = breakdown_df[breakdown_df["Amount"] > 0]

    if not breakdown_df.empty:
        fig = px.pie(
            breakdown_df, values="Amount", names="Category",
            title="CAPEX Breakdown",
            color_discrete_sequence=["#33528A", "#33A9A0", "#8AB62E", "#C4E81D", "#597001"],
        )
        fig.update_layout(
            paper_bgcolor="#f8fafc",
            plot_bgcolor="#ffffff",
            font=dict(family="Inter, Segoe UI, system-ui, sans-serif", color="#0f172a", size=14),
            title_font=dict(size=16, color="#0f172a"),
        )
        st.plotly_chart(fig, use_container_width=True)

# ============================================================================
# NAVIGATION
# ============================================================================

st.markdown("---")
col1, col2, col3, col4 = st.columns([1, 1, 1, 2])

with col1:
    if st.button("Home", use_container_width=True, key="s6_home"):
        st.switch_page("planning_guide.py")

with col2:
    if st.button("Back", use_container_width=True):
        st.switch_page("pages/5_Project_Timeline.py")

with col3:
    if st.button("Restart", use_container_width=True):
        st.switch_page(step1_page)

with col4:
    st.markdown(
        "<div style='text-align: right; color: #94a3b8; font-size: 0.85rem; padding-top: 0.5rem;'>"
        "Step 6 of 6</div>",
        unsafe_allow_html=True
    )
