"""
Page 3: Confidence & Recommendations

Displays overall confidence assessment, recommended proxies for missing data,
effort/duration estimates, and a data source directory.
"""

import streamlit as st
from config.data_inputs import get_data_inputs, get_proxy_options_for_context, get_proxy_confidence

st.set_page_config(page_title="Confidence & Recommendations", page_icon="🎯", layout="wide")

# Hide the sidebar pages navigation
st.markdown("""
<style>
    [data-testid="stSidebarNav"] {display: none;}
    section[data-testid="stSidebar"] {display: none;}
</style>
""", unsafe_allow_html=True)

# ============================================================================
# CHECK PREREQUISITES
# ============================================================================

if "analysis_type" not in st.session_state or not st.session_state.analysis_type:
    st.warning("⚠️ Please complete Step 1 first: Define Scope and Context")
    if st.button("Go to Step 1"):
        st.switch_page("pages/1_Define_Scope_and_Context.py")
    st.stop()

# ============================================================================
# GET SELECTIONS FROM PREVIOUS STEPS
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
# REBUILD DATA FROM STEP 2 (read session state)
# ============================================================================

data_inputs = get_data_inputs(
    analysis_type, analysis_focus, analysis_scale, analysis_context,
    renewable_types, urban_design_types, climate_resilience_types
)

if not data_inputs:
    st.warning("No data inputs found. Please complete Step 2 first.")
    if st.button("← Back to Step 2"):
        st.switch_page("pages/2_Review_Data.py")
    st.stop()

# Reconstruct page_key (same logic as Page 2)
renewable_str = "_".join(renewable_types) if renewable_types else "none"
urban_str = "_".join(urban_design_types) if urban_design_types else "none"
climate_str = "_".join(climate_resilience_types) if climate_resilience_types else "none"
page_key = f"page2_{analysis_type_str}_{analysis_focus}_{analysis_scale}_{analysis_context}_{renewable_str}_{urban_str}_{climate_str}".replace(" ", "_").replace("&", "and")

# Gather all data items and compute availability/confidence
all_items = []
for category_data in data_inputs:
    all_items.extend(category_data["items"])

available_items = []
missing_items = []
confidences = []
missing_with_proxy = []

for item in all_items:
    item_key = item["key"]
    has_data_key = f"{page_key}_{item_key}_has_data"
    has_data = st.session_state.get(has_data_key, "Yes")

    if has_data == "Yes":
        available_items.append(item)
    else:
        missing_items.append(item)
        proxy_key = f"{page_key}_{item_key}_proxy"
        selected_proxy = st.session_state.get(proxy_key)
        if selected_proxy:
            conf_info = get_proxy_confidence(analysis_context, item_key, selected_proxy)
            conf_val = conf_info.get("confidence")
            if conf_val is not None:
                confidences.append(conf_val)
            missing_with_proxy.append({
                "item": item,
                "proxy": selected_proxy,
                "confidence": conf_val,
                "conf_info": conf_info,
            })
        else:
            missing_with_proxy.append({
                "item": item,
                "proxy": None,
                "confidence": None,
                "conf_info": {},
            })

available_count = len(available_items)
missing_count = len(missing_items)
total_count = len(all_items)

# Overall confidence calculation
if confidences:
    avg_proxy_conf = round(sum(confidences) / len(confidences), 1)
else:
    avg_proxy_conf = None

# Compute overall confidence: base from available data %, adjusted by proxy confidence
data_coverage_pct = (available_count / total_count * 100) if total_count > 0 else 0
if missing_count == 0:
    overall_confidence = 95  # Near-perfect when all data available
elif avg_proxy_conf is not None:
    # Blend: coverage weight + proxy confidence weight
    overall_confidence = round(data_coverage_pct * 0.6 + avg_proxy_conf * 0.4)
else:
    overall_confidence = round(data_coverage_pct * 0.7)

overall_confidence = max(0, min(100, overall_confidence))

# Determine confidence color/level
if overall_confidence >= 70:
    conf_color = "#16a34a"
    conf_bg = "rgba(34,197,94,0.10)"
    conf_border = "rgba(34,197,94,0.30)"
    conf_level = "Good"
elif overall_confidence >= 50:
    conf_color = "#d97706"
    conf_bg = "rgba(245,158,11,0.10)"
    conf_border = "rgba(245,158,11,0.30)"
    conf_level = "Moderate"
else:
    conf_color = "#ef4444"
    conf_bg = "rgba(239,68,68,0.10)"
    conf_border = "rgba(239,68,68,0.30)"
    conf_level = "Low"

# Effort estimation
EFFORT_BASE = {
    "Energy & Carbon Performance": 60,
    "Solar PV Potential": 50,
    "Thermal Comfort": 55,
    "Daylighting": 45,
    "Wind & Ventilation": 50,
    "Renewable Energy & Local Production": 50,
    "Climate Resilience": 70,
}
SCALE_MULT = {"Building": 1.0, "Neighborhood": 1.8, "City": 2.5}

base_hours = EFFORT_BASE.get(analysis_type_str, 55)
scale_mult = SCALE_MULT.get(analysis_scale, 1.0)
completeness_mult = 1.0 + (1.0 - data_coverage_pct / 100.0) * 0.7
proxy_mult = 1.0 + len([m for m in missing_with_proxy if m["proxy"]]) * 0.03
total_hours = round(base_hours * scale_mult * completeness_mult * proxy_mult)
duration_weeks = max(1, round(total_hours / 30))

# ============================================================================
# PAGE HEADER
# ============================================================================

st.markdown(
    "<h2 style='font-size:1.35rem; font-weight:700; margin-bottom:0.5rem;'>"
    "Step 3: Confidence & Recommendations</h2>",
    unsafe_allow_html=True
)
st.markdown(
    "<p style='font-size:0.98rem; color:#64748b; margin-top:-0.5rem; margin-bottom:0.7rem;'>"
    "Review your data confidence, estimated effort, and recommendations for improving results.</p>",
    unsafe_allow_html=True
)

# Context bar
context_info = f"<span style='font-size:0.93rem; color:#334155;'><b>Analysis:</b> {analysis_type_str}"
if analysis_focus:
    context_info += f" → <b>{analysis_focus}</b>"
if analysis_scale:
    context_info += f" | <b>Scale:</b> {analysis_scale}"
if analysis_context:
    context_info += f" | <b>Context:</b> {analysis_context}"
context_info += "</span>"
st.markdown(context_info, unsafe_allow_html=True)

# ============================================================================
# TOP SUMMARY CARDS
# ============================================================================

card_html = f"""
<style>
.s3-card-row {{
    display: flex;
    gap: 1.2rem;
    margin: 1.2rem 0 1.5rem 0;
}}
.s3-card {{
    flex: 1 1 0;
    border-radius: 16px;
    padding: 1.2rem 1.5rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 110px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.06);
}}
.s3-card .s3-value {{
    font-size: 2rem;
    font-weight: 700;
    margin-bottom: 0.25rem;
}}
.s3-card .s3-label {{
    font-size: 0.95rem;
    font-weight: 500;
    color: #6b7280;
}}
</style>
<div class="s3-card-row">
    <div class="s3-card" style="background: {conf_bg}; border: 1px solid {conf_border};">
        <div class="s3-value" style="color: {conf_color};">{overall_confidence}%</div>
        <div class="s3-label">Overall Confidence ({conf_level})</div>
    </div>
    <div class="s3-card" style="background: rgba(99,102,241,0.10); border: 1px solid rgba(99,102,241,0.25);">
        <div class="s3-value" style="color: #6366f1;">{total_hours} hrs</div>
        <div class="s3-label">Estimated Effort</div>
    </div>
    <div class="s3-card" style="background: rgba(59,130,246,0.10); border: 1px solid rgba(59,130,246,0.25);">
        <div class="s3-value" style="color: #3b82f6;">{duration_weeks} wk</div>
        <div class="s3-label">Estimated Duration</div>
    </div>
</div>
"""
st.markdown(card_html, unsafe_allow_html=True)

# ============================================================================
# DATA AVAILABILITY SUMMARY
# ============================================================================

st.markdown(
    "<hr style='margin: 0.5rem 0 1rem 0; border: none; border-top: 1px solid #e2e8f0;'>",
    unsafe_allow_html=True
)

# Progress bar for data coverage
st.markdown(
    f"<div style='font-size:1.05rem; font-weight:600; margin-bottom:0.4rem;'>"
    f"Data Coverage: {available_count} / {total_count} datasets available "
    f"({data_coverage_pct:.0f}%)</div>",
    unsafe_allow_html=True
)

progress_color = conf_color
st.markdown(
    f"""<div style="background: #e5e7eb; border-radius: 8px; height: 12px; overflow: hidden; margin-bottom: 1rem;">
        <div style="background: {progress_color}; height: 100%; width: {data_coverage_pct}%; border-radius: 8px; transition: width 0.5s;"></div>
    </div>""",
    unsafe_allow_html=True
)

# ============================================================================
# MISSING DATA & PROXY RECOMMENDATIONS
# ============================================================================

if missing_items:
    st.markdown(
        "<div style='font-size:1.08rem; font-weight:600; margin-bottom:0.5rem;'>"
        "📋 Missing Data & Proxy Recommendations</div>",
        unsafe_allow_html=True
    )
    st.markdown(
        "<p style='font-size:0.9rem; color:#64748b; margin-top:-0.3rem; margin-bottom:0.8rem;'>"
        "The following datasets are missing. Where proxies have been selected, confidence impacts are shown.</p>",
        unsafe_allow_html=True
    )

    for entry in missing_with_proxy:
        item = entry["item"]
        proxy = entry["proxy"]
        conf_val = entry["confidence"]

        if proxy:
            # Has a proxy selected
            if conf_val is not None and conf_val >= 85:
                badge_color = "#16a34a"
                badge_bg = "#dcfce7"
                badge_text = f"✓ {conf_val}% confidence"
            elif conf_val is not None and conf_val >= 70:
                badge_color = "#d97706"
                badge_bg = "#fef3c7"
                badge_text = f"⚠ {conf_val}% confidence"
            elif conf_val is not None:
                badge_color = "#ef4444"
                badge_bg = "#fee2e2"
                badge_text = f"✗ {conf_val}% confidence"
            else:
                badge_color = "#94a3b8"
                badge_bg = "#f1f5f9"
                badge_text = "Confidence N/A"

            with st.expander(f"❌ {item['label']}  →  Proxy: {proxy}", expanded=False):
                st.markdown(
                    f"<div style='display:flex; align-items:center; gap:10px; margin-bottom:0.5rem;'>"
                    f"<span style='background:{badge_bg}; color:{badge_color}; padding:3px 10px; "
                    f"border-radius:6px; font-weight:600; font-size:0.88rem;'>{badge_text}</span>"
                    f"</div>",
                    unsafe_allow_html=True
                )
                rec_source = item.get("recommended_source", "To be defined")
                st.markdown(f"**Recommended source:** {rec_source}")
                st.markdown(f"**Selected proxy:** {proxy}")
                if conf_val is not None:
                    st.markdown(
                        f"Using this proxy provides **{conf_val}%** confidence for this data point. "
                        f"{'This is acceptable for most analyses.' if conf_val >= 70 else 'Consider finding a better data source to improve reliability.'}"
                    )
        else:
            # No proxy selected — flag as gap
            with st.expander(f"⚠️ {item['label']}  →  No proxy selected", expanded=False):
                st.markdown(
                    "<span style='background:#fee2e2; color:#ef4444; padding:3px 10px; "
                    "border-radius:6px; font-weight:600; font-size:0.88rem;'>⚠ Data gap — no proxy</span>",
                    unsafe_allow_html=True
                )
                rec_source = item.get("recommended_source", "To be defined")
                st.markdown(f"**Recommended source:** {rec_source}")
                proxy_options = item.get("proxy_options", [])
                if proxy_options:
                    st.markdown(f"**Available proxies:** {', '.join(proxy_options)}")
                    st.caption("Go back to Step 2 to select a proxy for this data item.")
                else:
                    st.caption("No proxy options available. This data must be obtained directly.")
else:
    st.success("✅ All required datasets are available! No proxies needed.")

# ============================================================================
# CONFIDENCE IMPROVEMENT — WHAT IF?
# ============================================================================

st.markdown(
    "<hr style='margin: 1rem 0; border: none; border-top: 1px solid #e2e8f0;'>",
    unsafe_allow_html=True
)

if missing_items:
    with st.expander("🎯 What If? — Confidence Improvement Calculator", expanded=False):
        st.markdown(
            "**Select data items you plan to obtain to see how confidence improves:**"
        )

        planned_items = []
        for idx, item in enumerate(missing_items):
            if st.checkbox(item["label"], key=f"whatif_{idx}_{item['key']}"):
                planned_items.append(item)

        if planned_items:
            new_available = available_count + len(planned_items)
            new_coverage = (new_available / total_count * 100) if total_count > 0 else 0
            if missing_count - len(planned_items) == 0:
                new_confidence = 95
            elif avg_proxy_conf is not None:
                new_confidence = round(new_coverage * 0.6 + avg_proxy_conf * 0.4)
            else:
                new_confidence = round(new_coverage * 0.7)
            new_confidence = max(0, min(100, new_confidence))
            improvement = new_confidence - overall_confidence

            if new_confidence >= 70:
                new_color = "#16a34a"
            elif new_confidence >= 50:
                new_color = "#d97706"
            else:
                new_color = "#ef4444"

            st.markdown(
                f"<div style='background: rgba(59,130,246,0.08); border-left: 3px solid #3b82f6; "
                f"padding: 0.8rem 1rem; border-radius: 8px; margin-top: 0.5rem;'>"
                f"<div style='font-size:1.1rem; font-weight:700; color:{new_color};'>"
                f"Predicted Confidence: {new_confidence}%</div>"
                f"<div style='font-size:0.95rem; color:#10b981; font-weight:600; margin-top:0.2rem;'>"
                f"+{improvement}% improvement</div>"
                f"</div>",
                unsafe_allow_html=True
            )

# ============================================================================
# EFFORT BREAKDOWN
# ============================================================================

st.markdown(
    "<hr style='margin: 1rem 0; border: none; border-top: 1px solid #e2e8f0;'>",
    unsafe_allow_html=True
)

with st.expander("📊 Effort & Duration Breakdown", expanded=False):
    phases = {
        "Scoping": 0.10,
        "Data Collection": 0.30,
        "Modeling & Simulation": 0.35,
        "Validation & QA": 0.15,
        "Reporting": 0.10,
    }

    st.markdown(
        f"<div style='font-size:0.95rem; color:#64748b; margin-bottom:0.7rem;'>"
        f"Based on <b>{analysis_type_str}</b> at <b>{analysis_scale}</b> scale "
        f"with <b>{data_coverage_pct:.0f}%</b> data coverage.</div>",
        unsafe_allow_html=True
    )

    for phase, fraction in phases.items():
        phase_hours = round(total_hours * fraction)
        bar_width = fraction * 100
        st.markdown(
            f"<div style='display:flex; align-items:center; gap:0.8rem; margin-bottom:0.5rem;'>"
            f"<div style='width:160px; font-size:0.9rem; font-weight:500;'>{phase}</div>"
            f"<div style='flex:1; background:#e5e7eb; border-radius:6px; height:10px; overflow:hidden;'>"
            f"<div style='background:#6366f1; height:100%; width:{bar_width}%; border-radius:6px;'></div>"
            f"</div>"
            f"<div style='width:55px; text-align:right; font-size:0.88rem; font-weight:600; color:#374151;'>"
            f"{phase_hours} hrs</div>"
            f"</div>",
            unsafe_allow_html=True
        )

    st.markdown(
        f"<div style='margin-top:0.5rem; font-size:0.9rem; color:#64748b;'>"
        f"<b>Total:</b> {total_hours} hours | <b>Duration:</b> ~{duration_weeks} weeks "
        f"(at 30 hrs/week)</div>",
        unsafe_allow_html=True
    )

# ============================================================================
# NAVIGATION
# ============================================================================

st.markdown("---")
col1, col2, col3 = st.columns([1, 1, 2])

with col1:
    if st.button("← Back to Step 2", use_container_width=True):
        st.switch_page("pages/2_Review_Data.py")

with col2:
    if st.button("Next: Step 4 →", type="primary", use_container_width=True):
        st.switch_page("pages/4_Expected_Results.py")

with col3:
    st.markdown(
        "<div style='text-align: right; color: #94a3b8; font-size: 0.9rem; padding-top: 0.5rem;'>"
        "Page 3 of 6</div>",
        unsafe_allow_html=True
    )
