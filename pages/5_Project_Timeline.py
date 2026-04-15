"""
Page 5: Project Timeline

Interactive timeline planner — set project dates, auto-generate a Gantt chart
from effort estimates, and allow manual editing of tasks.
"""

import streamlit as st
import pandas as pd
import plotly.express as px
from datetime import datetime, timedelta
from config.data_inputs import get_data_inputs, get_proxy_confidence
from utils.shared_css import inject_shared_css, render_step_indicator, render_top_cards

st.set_page_config(page_title="Project Timeline", layout="wide")

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
is_plus_mode = st.session_state.get("pipeline_mode") == "step1plus"
_is_plus_reno = (
    is_plus_mode
    and st.session_state.get("project_type") == "Renovation Planning"
)
render_step_indicator(6 if _is_plus_reno else 5)

step1_page = "pages/0_Define_Project.py" if is_plus_mode else "pages/1_Define_Scope_and_Context.py"

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
# EFFORT ESTIMATION (same logic as Page 3)
# ============================================================================

data_inputs = get_data_inputs(
    analysis_type, analysis_focus, analysis_scale, analysis_context,
    renewable_types, urban_design_types, climate_resilience_types
)

# ── Read persisted choices from Step 2 ──────────────────────────────
# Page 2 saves a plain dict (not widget keys) to session state so that
# the data-availability selections survive page navigation.
step2_choices = st.session_state.get("step2_data_choices", {})

all_items = []
for cat in (data_inputs or []):
    all_items.extend(cat["items"])
total_count = len(all_items)

available_count = 0
proxies_with_selection = 0
for item in all_items:
    choice = step2_choices.get(item["key"], {})
    has_data = choice.get("has_data", "Yes")
    if has_data == "Yes":
        available_count += 1
    else:
        proxy = choice.get("proxy")
        if proxy:
            proxies_with_selection += 1

data_coverage_pct = (available_count / total_count * 100) if total_count > 0 else 0

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

base_hours = EFFORT_BASE.get(analysis_type_str, 55)
scale_mult = SCALE_MULT.get(analysis_scale, 1.0)
completeness_mult = 1.0 + (1.0 - data_coverage_pct / 100.0) * 0.7
proxy_mult = 1.0 + proxies_with_selection * 0.03
total_hours = round(base_hours * scale_mult * completeness_mult * proxy_mult)
duration_weeks = max(1, round(total_hours / 30))

# ============================================================================
# INITIALIZE SESSION STATE FOR TIMELINE
# ============================================================================

if "p5_project_start" not in st.session_state:
    st.session_state.p5_project_start = datetime.today().date()
if "p5_project_end" not in st.session_state:
    st.session_state.p5_project_end = (datetime.today() + timedelta(weeks=duration_weeks)).date()
if "p5_timeline_rows" not in st.session_state:
    st.session_state.p5_timeline_rows = []

# ============================================================================
# PAGE HEADER
# ============================================================================

st.markdown(
    "<h2 style='font-size:1.5rem; font-weight:700; color:#0f172a; letter-spacing:-0.01em; margin-bottom:0.5rem;'>"
    "Step 5: Project Timeline</h2>",
    unsafe_allow_html=True
)
st.markdown(
    "<p style='font-size:0.92rem; color:#64748b; margin-top:-0.5rem; margin-bottom:0.7rem;'>"
    "Plan your project schedule. Auto-generate phases from effort estimates or build your own.</p>",
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
# SUMMARY CARDS
# ============================================================================

num_phases = len(PHASE_SPLIT)

render_top_cards([
    {"value": f"{total_hours} hrs", "label": "Estimated Effort",
     "color": "#33528A", "bg": "rgba(51,82,138,0.10)", "border": "rgba(51,82,138,0.25)"},
    {"value": f"{duration_weeks} wk", "label": "Estimated Duration",
     "color": "#33A9A0", "bg": "rgba(51,169,160,0.10)", "border": "rgba(51,169,160,0.25)"},
    {"value": str(num_phases), "label": "Project Phases",
     "color": "#8AB62E", "bg": "rgba(138,182,46,0.10)", "border": "rgba(138,182,46,0.25)"},
])

# ============================================================================
# EDITABLE EFFORT & DURATION BREAKDOWN
# ============================================================================

st.markdown(
    "<hr style='margin: 0.5rem 0 1rem 0; border: none; border-top: 1px solid #e2e8f0;'>",
    unsafe_allow_html=True
)

with st.expander("Effort and Duration Breakdown", expanded=True):
    st.markdown(
        f"<div style='font-size:0.95rem; color:#64748b; margin-bottom:0.7rem;'>"
        f"Based on <b>{analysis_type_str}</b> at <b>{analysis_scale}</b> scale "
        f"with <b>{data_coverage_pct:.0f}%</b> data coverage. "
        f"Adjust hours per phase as needed.</div>",
        unsafe_allow_html=True
    )

    # Initialise editable phase hours in session state on first visit
    if "p5_phase_hours" not in st.session_state:
        st.session_state.p5_phase_hours = {
            phase: round(total_hours * frac) for phase, frac in PHASE_SPLIT.items()
        }

    # Offer a button to reset to auto-calculated values
    if st.button("Reset to estimated values", key="p5_reset_effort"):
        st.session_state.p5_phase_hours = {
            phase: round(total_hours * frac) for phase, frac in PHASE_SPLIT.items()
        }
        st.rerun()

    # Render editable number inputs for each phase
    # First pass: collect current values via number_input widgets
    updated_phase_hours = {}
    phase_cols = {}  # store bar column refs for second pass
    for phase, frac in PHASE_SPLIT.items():
        default_hrs = st.session_state.p5_phase_hours.get(phase, round(total_hours * frac))
        col_label, col_input, col_bar = st.columns([2, 1, 4])
        with col_label:
            st.markdown(
                f"<div style='font-size:0.9rem; font-weight:500; padding-top:0.45rem;'>{phase}</div>",
                unsafe_allow_html=True,
            )
        with col_input:
            new_val = st.number_input(
                phase,
                min_value=0,
                value=default_hrs,
                step=1,
                key=f"p5_phase_{phase}",
                label_visibility="collapsed",
            )
            updated_phase_hours[phase] = new_val
        phase_cols[phase] = col_bar

    # Second pass: draw bars now that we know the true max across all phases
    max_hrs = max(updated_phase_hours.values()) if updated_phase_hours else 1
    for phase, col_bar in phase_cols.items():
        hrs = updated_phase_hours[phase]
        bar_pct = (hrs / max_hrs * 100) if max_hrs > 0 else 0
        with col_bar:
            st.markdown(
                f"<div style='padding-top:0.45rem;'>"
                f"<div style='background:#e5e7eb; border-radius:6px; height:10px; overflow:hidden;'>"
                f"<div style='background:#33A9A0; height:100%; width:{bar_pct:.0f}%; border-radius:6px;'></div>"
                f"</div></div>",
                unsafe_allow_html=True,
            )

    # Persist edited values
    st.session_state.p5_phase_hours = updated_phase_hours

    # Totals
    user_total_hours = sum(updated_phase_hours.values())
    user_duration_weeks = max(1, round(user_total_hours / 30))

    st.markdown(
        f"<div style='margin-top:0.5rem; font-size:0.9rem; color:#64748b;'>"
        f"<b>Total:</b> {user_total_hours} hours &nbsp;|&nbsp; "
        f"<b>Duration:</b> ~{user_duration_weeks} weeks (at 30 hrs/week)"
        f"</div>",
        unsafe_allow_html=True,
    )

# Use user-edited totals for downstream timeline generation
total_hours = sum(st.session_state.get("p5_phase_hours", {phase: round(total_hours * frac) for phase, frac in PHASE_SPLIT.items()}).values()) or total_hours
duration_weeks = max(1, round(total_hours / 30))

# ============================================================================
# DATE INPUTS
# ============================================================================

st.markdown(
    "<hr style='margin: 0.5rem 0 1rem 0; border: none; border-top: 1px solid #e2e8f0;'>",
    unsafe_allow_html=True
)

dcol1, dcol2 = st.columns(2)
with dcol1:
    st.session_state.p5_project_start = st.date_input(
        "Project Start Date",
        value=st.session_state.p5_project_start,
        key="p5_start_input"
    )
with dcol2:
    st.session_state.p5_project_end = st.date_input(
        "Project End Date",
        value=st.session_state.p5_project_end,
        key="p5_end_input"
    )

# ============================================================================
# AUTO-GENERATE TIMELINE
# ============================================================================

st.markdown(
    "<hr style='margin: 0.5rem 0 1rem 0; border: none; border-top: 1px solid #e2e8f0;'>",
    unsafe_allow_html=True
)

gen_col1, gen_col2, gen_col3 = st.columns([1, 1, 2])
with gen_col1:
    generate_clicked = st.button(
        "Generate Timeline",
        use_container_width=True,
        help="Auto-populate phases based on effort breakdown"
    )
with gen_col2:
    clear_clicked = st.button("Clear", use_container_width=True)

if generate_clicked:
    start_date = pd.to_datetime(st.session_state.p5_project_start)
    weekly_capacity = 30.0
    rows = []
    current = start_date
    edited_phases = st.session_state.get("p5_phase_hours", {
        phase: round(total_hours * frac) for phase, frac in PHASE_SPLIT.items()
    })
    for phase, phase_hours in edited_phases.items():
        weeks = max(1, round(phase_hours / weekly_capacity)) if phase_hours > 0 else 1
        days = int(weeks * 7)
        finish = current + pd.to_timedelta(days, unit="D")
        rows.append({
            "Task": phase,
            "Start": current.date(),
            "Finish": finish.date(),
            "Hours": phase_hours,
            "Owner": "",
            "Phase": phase,
        })
        current = finish
    st.session_state.p5_timeline_rows = rows
    st.rerun()

if clear_clicked:
    st.session_state.p5_timeline_rows = []
    st.rerun()

# ============================================================================
# EDITABLE TIMELINE TABLE
# ============================================================================

st.markdown(
    "<div style='font-size:1.02rem; font-weight:600; margin-bottom:0.5rem;'>"
    "Timeline Editor</div>",
    unsafe_allow_html=True
)

if st.session_state.p5_timeline_rows:
    timeline_df = pd.DataFrame(st.session_state.p5_timeline_rows)
else:
    timeline_df = pd.DataFrame(
        columns=["Task", "Start", "Finish", "Hours", "Owner", "Phase"]
    )

edited_timeline = st.data_editor(
    timeline_df,
    num_rows="dynamic",
    use_container_width=True,
    column_config={
        "Task": st.column_config.TextColumn("Task", required=True),
        "Start": st.column_config.DateColumn("Start"),
        "Finish": st.column_config.DateColumn("Finish"),
        "Hours": st.column_config.NumberColumn("Hours", min_value=0, step=1),
        "Owner": st.column_config.TextColumn("Owner"),
        "Phase": st.column_config.SelectboxColumn(
            "Phase",
            options=list(PHASE_SPLIT.keys()) + ["Other"],
        ),
    },
    key="p5_timeline_editor"
)

# Save edits back
st.session_state.p5_timeline_rows = edited_timeline.to_dict(orient="records")

# Summary
if not edited_timeline.empty and "Hours" in edited_timeline.columns:
    total_planned = int(edited_timeline["Hours"].fillna(0).sum())
    st.caption(
        f"Timeline total: **{total_planned} hours** across "
        f"**{len(edited_timeline)}** tasks "
        f"(estimated baseline: {total_hours} hours)"
    )

# ============================================================================
# GANTT CHART
# ============================================================================

st.markdown(
    "<hr style='margin: 1rem 0; border: none; border-top: 1px solid #e2e8f0;'>",
    unsafe_allow_html=True
)

valid_timeline = edited_timeline.dropna(subset=["Task", "Start", "Finish"])
if not valid_timeline.empty:
    try:
        valid_timeline = valid_timeline.copy()
        valid_timeline["Start"] = pd.to_datetime(valid_timeline["Start"])
        valid_timeline["Finish"] = pd.to_datetime(valid_timeline["Finish"])

        fig = px.timeline(
            valid_timeline,
            x_start="Start",
            x_end="Finish",
            y="Task",
            color="Phase" if "Phase" in valid_timeline.columns else None,
            title="Project Timeline (Gantt)",
            color_discrete_sequence=[
                "#33528A", "#33A9A0", "#8AB62E", "#C4E81D", "#597001", "#1A1A1A"
            ],
        )
        fig.update_yaxes(autorange="reversed")
        fig.update_layout(
            paper_bgcolor="#f8fafc",
            plot_bgcolor="#ffffff",
            font=dict(family="Inter, Segoe UI, system-ui, sans-serif", color="#0f172a", size=14),
            title_font=dict(size=16, color="#0f172a"),
            xaxis=dict(gridcolor="#e2e8f0"),
            yaxis=dict(gridcolor="#e2e8f0"),
            height=max(300, len(valid_timeline) * 55 + 100),
        )
        st.plotly_chart(fig, use_container_width=True)
    except Exception as e:
        st.warning(f"Could not render Gantt chart: {e}")
else:
    st.info(
        "No timeline data yet. Use **Generate Timeline from Estimates** above "
        "or add rows manually in the editor."
    )

# ============================================================================
# NAVIGATION
# ============================================================================

st.markdown("---")
col1, col2, col3, col4 = st.columns([1, 1, 1, 2])

with col1:
    if st.button("Home", use_container_width=True, key="s5_home"):
        st.switch_page("planning_guide.py")

with col2:
    if st.button("Back", use_container_width=True):
        st.switch_page("pages/4_Expected_Results.py")

with col3:
    if st.button("Continue", type="primary", use_container_width=True):
        st.switch_page("pages/6_Tasks_and_Cost.py")

with col4:
    _is_plus_reno = (
        is_plus_mode
        and st.session_state.get("project_type") == "Renovation Planning"
    )
    _step_lbl = "Step 6+ of 7" if _is_plus_reno else "Step 5 of 6"
    st.markdown(
        f"<div style='text-align: right; color: #94a3b8; font-size: 0.85rem; padding-top: 0.5rem;'>"
        f"{_step_lbl}</div>",
        unsafe_allow_html=True
    )
