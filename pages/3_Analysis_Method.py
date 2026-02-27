"""
Page 3: Confidence & Recommendations

Displays overall confidence assessment, recommended proxies for missing data,
effort/duration estimates, and a data source directory.
"""

import streamlit as st
from config.data_inputs import get_data_inputs, get_proxy_options_for_context, get_proxy_confidence
from config.sensitivity_config import get_sensitivity_weight
from utils.shared_css import inject_shared_css, render_step_indicator, render_top_cards

st.set_page_config(page_title="Confidence & Recommendations", layout="wide")

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
render_step_indicator(3)

# ============================================================================
# CHECK PREREQUISITES
# ============================================================================

if "analysis_type" not in st.session_state or not st.session_state.analysis_type:
    st.warning("Please complete Step 1 first.")
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
    if st.button("Back to Step 2"):
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
item_status = {}  # For sensitivity analysis

for item in all_items:
    item_key = item["key"]
    has_data_key = f"{page_key}_{item_key}_has_data"
    has_data = st.session_state.get(has_data_key, "Yes")

    if has_data == "Yes":
        available_items.append(item)
        item_status[item_key] = {
            "available": True,
            "proxy_name": None,
            "proxy_confidence": None,
        }
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
            item_status[item_key] = {
                "available": False,
                "proxy_name": selected_proxy,
                "proxy_confidence": conf_val,
            }
        else:
            missing_with_proxy.append({
                "item": item,
                "proxy": None,
                "confidence": None,
                "conf_info": {},
            })
            item_status[item_key] = {
                "available": False,
                "proxy_name": None,
                "proxy_confidence": None,
            }

available_count = len(available_items)
missing_count = len(missing_items)
total_count = len(all_items)

# Data coverage percentage (simple count-based)
data_coverage_pct = (available_count / total_count * 100) if total_count > 0 else 0

# Avg proxy confidence (for display purposes)
if confidences:
    avg_proxy_conf = round(sum(confidences) / len(confidences), 1)
else:
    avg_proxy_conf = None

# ── SENSITIVITY-BASED CONFIDENCE CALCULATION ──
# Each parameter's contribution to confidence is proportional to its impact
# on results (derived from sensitivity analysis).
#   Available data   → contributes full sensitivity weight
#   Proxy data       → contributes weight × (proxy_confidence / 100)
#   Missing (no proxy) → contributes nothing
total_weight = sum(get_sensitivity_weight(item["key"]) for item in all_items)

if total_weight > 0:
    earned_weight = 0.0
    for item in available_items:
        earned_weight += get_sensitivity_weight(item["key"])
    for entry in missing_with_proxy:
        if entry["confidence"] is not None:
            w = get_sensitivity_weight(entry["item"]["key"])
            earned_weight += w * entry["confidence"] / 100.0
    # Scale to 0–95 range (95 = maximum achievable confidence)
    overall_confidence = round(earned_weight / total_weight * 95)
else:
    earned_weight = 0.0
    overall_confidence = round(data_coverage_pct * 0.7)

overall_confidence = max(0, min(100, overall_confidence))

# Determine confidence level and colour
if overall_confidence >= 70:
    conf_level = "Good"
    conf_color = "#33A9A0"
    conf_bg = "rgba(51,169,160,0.10)"
    conf_border = "rgba(51,169,160,0.30)"
elif overall_confidence >= 50:
    conf_level = "Moderate"
    conf_color = "#33528A"
    conf_bg = "rgba(51,82,138,0.10)"
    conf_border = "rgba(51,82,138,0.30)"
else:
    conf_level = "Low"
    conf_color = "#597001"
    conf_bg = "rgba(89,112,1,0.10)"
    conf_border = "rgba(89,112,1,0.30)"

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
    "<h2 style='font-size:1.5rem; font-weight:700; color:#0f172a; letter-spacing:-0.01em; margin-bottom:0.5rem;'>"
    "Step 3: Confidence & Recommendations</h2>",
    unsafe_allow_html=True
)
st.markdown(
    "<p style='font-size:0.92rem; color:#64748b; margin-top:-0.5rem; margin-bottom:0.7rem;'>"
    "Review your data confidence, estimated effort, and recommendations for improving results.</p>",
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

render_top_cards([
    {"value": f"{overall_confidence}%", "label": f"Overall Confidence ({conf_level})",
     "color": conf_color, "bg": conf_bg, "border": conf_border},
    {"value": f"{total_hours} hrs", "label": "Estimated Effort",
     "color": "#33528A", "bg": "rgba(51,82,138,0.08)", "border": "rgba(51,82,138,0.20)"},
    {"value": f"{duration_weeks} wk", "label": "Estimated Duration",
     "color": "#33A9A0", "bg": "rgba(51,169,160,0.08)", "border": "rgba(51,169,160,0.20)"},
])

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
        "<div style='font-size:1.02rem; font-weight:600; margin-bottom:0.5rem;'>"
        "Missing Data and Proxy Recommendations</div>",
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
                badge_color = "#33A9A0"
                badge_bg = "rgba(51,169,160,0.15)"
                badge_text = f"{conf_val}% confidence"
            elif conf_val is not None and conf_val >= 70:
                badge_color = "#33528A"
                badge_bg = "rgba(51,82,138,0.15)"
                badge_text = f"{conf_val}% confidence"
            elif conf_val is not None:
                badge_color = "#597001"
                badge_bg = "rgba(89,112,1,0.15)"
                badge_text = f"{conf_val}% confidence"
            else:
                badge_color = "#94a3b8"
                badge_bg = "#f1f5f9"
                badge_text = "Confidence N/A"

            with st.expander(f"{item['label']}  —  Proxy: {proxy}", expanded=False):
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
            with st.expander(f"{item['label']}  —  No proxy selected", expanded=False):
                st.markdown(
                    "<span style='background:rgba(89,112,1,0.15); color:#597001; padding:3px 10px; "
                    "border-radius:6px; font-weight:600; font-size:0.88rem;'>Data gap — no proxy</span>",
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
    st.success("All required datasets are available. No proxies needed.")

# ============================================================================
# SENSITIVITY ANALYSIS — PARAMETER IMPACT ON CONFIDENCE
# ============================================================================

st.markdown(
    "<hr style='margin: 1rem 0; border: none; border-top: 1px solid #e2e8f0;'>",
    unsafe_allow_html=True
)

with st.expander("Parameter Impact on Confidence (Sensitivity Weights)", expanded=False):
    st.markdown(
        "<p style='font-size:0.9rem; color:#64748b; margin-bottom:0.8rem;'>"
        "Each parameter is weighted by its importance from the sensitivity analysis. "
        "The bars show how much each parameter contributes to your confidence score.</p>",
        unsafe_allow_html=True
    )

    # Header row
    st.markdown(
        "<div style='display:flex; gap:0.5rem; padding:0.4rem 0; border-bottom:2px solid #e2e8f0; "
        "font-weight:600; font-size:0.85rem; color:#475569;'>"
        "<div style='width:200px;'>Parameter</div>"
        "<div style='width:70px; text-align:center;'>Weight</div>"
        "<div style='width:80px; text-align:center;'>Status</div>"
        "<div style='flex:1;'>Contribution</div>"
        "</div>",
        unsafe_allow_html=True
    )

    available_keys = {item["key"] for item in available_items}
    proxy_map = {
        entry["item"]["key"]: entry["confidence"]
        for entry in missing_with_proxy if entry["proxy"]
    }
    max_weight = max((get_sensitivity_weight(item["key"]) for item in all_items), default=1)

    # Sort items by weight (highest first)
    sorted_items = sorted(all_items, key=lambda it: get_sensitivity_weight(it["key"]), reverse=True)

    for item in sorted_items:
        w = get_sensitivity_weight(item["key"])

        if item["key"] in available_keys:
            status_badge = (
                "<span style='background:rgba(51,169,160,0.15); color:#33A9A0; padding:2px 8px; "
                "border-radius:4px; font-size:0.78rem; font-weight:600;'>Available</span>"
            )
            fill_pct = 100.0
            bar_color = "#33A9A0"
        elif item["key"] in proxy_map:
            pc = proxy_map[item["key"]]
            pct_label = f"{pc}%" if pc is not None else "N/A"
            status_badge = (
                f"<span style='background:rgba(51,82,138,0.15); color:#33528A; padding:2px 8px; "
                f"border-radius:4px; font-size:0.78rem; font-weight:600;'>"
                f"Proxy ({pct_label})</span>"
            )
            fill_pct = (pc if pc is not None else 50)
            bar_color = "#33528A"
        else:
            status_badge = (
                "<span style='background:rgba(89,112,1,0.15); color:#597001; padding:2px 8px; "
                "border-radius:4px; font-size:0.78rem; font-weight:600;'>Missing</span>"
            )
            fill_pct = 0
            bar_color = "#597001"

        bar_width = (w / max_weight) * fill_pct

        st.markdown(
            f"<div style='display:flex; gap:0.5rem; padding:0.45rem 0; border-bottom:1px solid #f1f5f9; "
            f"align-items:center; font-size:0.88rem;'>"
            f"<div style='width:200px; font-weight:500; color:#1e293b;'>{item['label']}</div>"
            f"<div style='width:70px; text-align:center; color:#64748b;'>{w:.1f}</div>"
            f"<div style='width:80px; text-align:center;'>{status_badge}</div>"
            f"<div style='flex:1;'>"
            f"  <div style='background:#e5e7eb; border-radius:4px; height:8px; overflow:hidden;'>"
            f"    <div style='background:{bar_color}; height:100%; width:{bar_width:.0f}%; border-radius:4px;'></div>"
            f"  </div>"
            f"</div>"
            f"</div>",
            unsafe_allow_html=True
        )

    # Summary footer
    st.markdown(
        f"<div style='margin-top:0.7rem; padding:0.6rem 0.8rem; background:rgba(51,82,138,0.06); "
        f"border-radius:8px; font-size:0.88rem; color:#334155;'>"
        f"<b>Total weight:</b> {total_weight:.1f} &nbsp;|&nbsp; "
        f"<b>Achieved:</b> {earned_weight:.1f} &nbsp;|&nbsp; "
        f"<b>Confidence:</b> <span style='font-weight:700; color:{conf_color};'>{overall_confidence}%</span>"
        f"</div>",
        unsafe_allow_html=True
    )

# ── What-If Calculator (sensitivity-aware) ──
if missing_items:
    with st.expander("What If? — Confidence Improvement Calculator", expanded=False):
        st.markdown(
            "**Select data items you plan to obtain to see how confidence improves "
            "(weighted by parameter importance):**"
        )

        whatif_planned = []
        for idx, item in enumerate(missing_items):
            w = get_sensitivity_weight(item["key"])
            dots = "●" * max(1, round(w / 4))  # visual weight indicator
            if st.checkbox(
                f"{item['label']}  ({dots} weight {w:.0f})",
                key=f"whatif_{idx}_{item['key']}"
            ):
                whatif_planned.append(item)

        if whatif_planned:
            # Recalculate with planned items counted as fully available
            avail_keys = {it["key"] for it in available_items}
            planned_keys_set = {it["key"] for it in whatif_planned}
            proxy_conf_map = {
                e["item"]["key"]: e["confidence"]
                for e in missing_with_proxy if e["confidence"] is not None
            }

            new_earned = 0.0
            for it in all_items:
                wt = get_sensitivity_weight(it["key"])
                if it["key"] in avail_keys or it["key"] in planned_keys_set:
                    new_earned += wt
                elif it["key"] in proxy_conf_map:
                    new_earned += wt * proxy_conf_map[it["key"]] / 100.0

            new_confidence = max(0, min(100, round(new_earned / total_weight * 95))) if total_weight > 0 else 95
            improvement = new_confidence - overall_confidence

            if new_confidence >= 70:
                new_color = "#33A9A0"
            elif new_confidence >= 50:
                new_color = "#33528A"
            else:
                new_color = "#597001"

            st.markdown(
                f"<div style='background: rgba(51,82,138,0.08); border-left: 3px solid #33528A; "
                f"padding: 0.8rem 1rem; border-radius: 8px; margin-top: 0.5rem;'>"
                f"<div style='font-size:1.1rem; font-weight:700; color:{new_color};'>"
                f"Predicted Confidence: {new_confidence}%</div>"
                f"<div style='font-size:0.95rem; color:#8AB62E; font-weight:600; margin-top:0.2rem;'>"
                f"+{improvement}% improvement</div>"
                f"<div style='font-size:0.85rem; color:#64748b; margin-top:0.3rem;'>"
                f"Weighted score: {new_earned:.1f} / {total_weight:.1f}"
                f"</div>"
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

with st.expander("Effort and Duration Breakdown", expanded=False):
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
            f"<div style='background:#33A9A0; height:100%; width:{bar_width}%; border-radius:6px;'></div>"
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
    if st.button("Back", use_container_width=True):
        st.switch_page("pages/2_Review_Data.py")

with col2:
    if st.button("Continue", type="primary", use_container_width=True):
        st.switch_page("pages/4_Expected_Results.py")

with col3:
    st.markdown(
        "<div style='text-align: right; color: #94a3b8; font-size: 0.85rem; padding-top: 0.5rem;'>"
        "Step 3 of 6</div>",
        unsafe_allow_html=True
    )
