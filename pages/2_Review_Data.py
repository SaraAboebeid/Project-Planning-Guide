"""
Page 2: Review Data Inputs

This page displays data inputs required for the selected analysis type,
with proxy alternatives and confidence estimates.
"""

import streamlit as st
from config.data_inputs import get_data_inputs, get_proxy_options_for_context, get_proxy_confidence

st.set_page_config(page_title="Review Data", page_icon="�", layout="wide")

# Hide the sidebar pages navigation
st.markdown("""
<style>
    [data-testid="stSidebarNav"] {display: none;}
    section[data-testid="stSidebar"] {display: none;}
</style>
""", unsafe_allow_html=True)


def _render_data_item(item: dict, page_key: str, context: str = None):
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
    
    # Data item label
    st.markdown(f"**{item_label}**")
    
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
        st.success("✓ Using recommended source")
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
                    color = "#22c55e"  # green
                    level = "Good"
                elif confidence_val >= 70:
                    color = "#f59e0b"  # amber
                    level = "Moderate"
                else:
                    color = "#ef4444"  # red
                    level = "Low"
                
                # Show confidence with estimated badge and tooltip
                source_badge = "ⓘ Estimated" if confidence_source == "estimated" else "✓ Validated"
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
                st.caption("⚠️ Confidence not yet estimated for this proxy")
        else:
            st.caption("⚠️ No proxy options available yet")
    
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
    st.warning("⚠️ Please complete Step 1 first: Define Scope and Context")
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
st.markdown("<h2 style='font-size:1.35rem; font-weight:700; margin-bottom:0.5rem;'>Step 2: Review Data Inputs</h2>", unsafe_allow_html=True)
st.markdown(
    "<p style='font-size:0.98rem; color:#64748b; margin-top:-0.5rem; margin-bottom:0.7rem;'>Review the required data inputs and select proxy alternatives if needed.</p>",
    unsafe_allow_html=True
)
context_info = f"<span style='font-size:0.93rem; color:#334155;'><b>Analysis Type:</b> {analysis_type_str}"
if analysis_focus:
    context_info += f" → <b>{analysis_focus}</b>"
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
    if st.button("← Back to Step 1"):
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

card_html = f"""
<style>
.card-row {{
  display: flex;
  gap: 1.5rem;
  margin-bottom: 1.5rem;
}}
.card-m3 {{
  background: rgba(210,198,250,0.2);
  border-radius: 18px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.04);
  padding: 1.2rem 2rem 1.2rem 2rem;
  flex: 1 1 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-width: 160px;
  min-height: 110px;
}}
.card-m3 .card-metric {{
  font-size: 2.1rem;
  font-weight: 700;
  color: #4b2996;
  margin-bottom: 0.2rem;
}}
.card-m3 .card-label {{
  font-size: 1.05rem;
  color: #6b7280;
  font-weight: 500;
  letter-spacing: 0.2px;
}}
</style>
<div class='card-row'>
  <div class='card-m3'>
    <div class='card-metric'>{available}</div>
    <div class='card-label'>Available Data</div>
  </div>
  <div class='card-m3'>
    <div class='card-metric'>{missing}</div>
    <div class='card-label'>Missing Data</div>
  </div>
  <div class='card-m3'>
    <div class='card-metric'>{avg_conf_display}</div>
    <div class='card-label'>Avg. Proxy Confidence</div>
  </div>
</div>
"""
st.markdown(card_html, unsafe_allow_html=True)




# ============================================================================
# RENDER DATA INPUTS
# ============================================================================


st.markdown("<hr style='margin: 0.7rem 0 0.7rem 0; border: none; border-top: 1px solid #e2e8f0;'>", unsafe_allow_html=True)
st.markdown("<div style='font-size:1.08rem; font-weight:600; margin-bottom:0.2rem;'>Do you have the following data inputs?</div>", unsafe_allow_html=True)

for category_data in data_inputs:
    category_name = category_data["category"]
    items = category_data["items"]
    
    with st.expander(category_name, expanded=False):
        for item in items:
            _render_data_item(item, page_key, analysis_context)


available = 0

# ============================================================================
# NAVIGATION
# ============================================================================

st.markdown("---")
col1, col2, col3 = st.columns([1, 1, 2])

with col1:
    if st.button("← Back to Step 1", use_container_width=True):
        st.switch_page("pages/1_Define_Scope_and_Context.py")

with col2:
    if st.button("Next: Step 3 →", type="primary", use_container_width=True):
        # TODO: Create Step 3 page
        st.info("Step 3 coming soon!")
        # st.switch_page("pages/3_Analysis_Method.py")

with col3:
    st.markdown(
        "<div style='text-align: right; color: #94a3b8; font-size: 0.9rem; padding-top: 0.5rem;'>"
        "Page 2 of 6</div>",
        unsafe_allow_html=True
    )
"""
Page 2: Review Data Inputs

This page displays data inputs required for the selected analysis type,
with proxy alternatives and confidence estimates.
"""

import streamlit as st
from config.data_inputs import get_data_inputs, get_proxy_options_for_context, get_proxy_confidence

st.set_page_config(page_title="Review Data", page_icon="�", layout="wide")

# Hide the sidebar pages navigation
st.markdown("""
<style>
    [data-testid="stSidebarNav"] {display: none;}
    section[data-testid="stSidebar"] {display: none;}
</style>
""", unsafe_allow_html=True)


def _render_data_item(item: dict, page_key: str, context: str = None):
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
    
    # Data item label
    st.markdown(f"**{item_label}**")
    
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
        st.success("✓ Using recommended source")
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
                    color = "#22c55e"  # green
                    level = "Good"
                elif confidence_val >= 70:
                    color = "#f59e0b"  # amber
                    level = "Moderate"
                else:
                    color = "#ef4444"  # red
                    level = "Low"
                
                # Show confidence with estimated badge and tooltip
                source_badge = "ⓘ Estimated" if confidence_source == "estimated" else "✓ Validated"
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
                st.caption("⚠️ Confidence not yet estimated for this proxy")
        else:
            st.caption("⚠️ No proxy options available yet")
    
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
    st.warning("⚠️ Please complete Step 1 first: Define Scope and Context")
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
st.markdown("<h2 style='font-size:1.35rem; font-weight:700; margin-bottom:0.5rem;'>Step 2: Review Data Inputs</h2>", unsafe_allow_html=True)
st.markdown(
    "<p style='font-size:0.98rem; color:#64748b; margin-top:-0.5rem; margin-bottom:0.7rem;'>Review the required data inputs and select proxy alternatives if needed.</p>",
    unsafe_allow_html=True
)
context_info = f"<span style='font-size:0.93rem; color:#334155;'><b>Analysis Type:</b> {analysis_type_str}"
if analysis_focus:
    context_info += f" → <b>{analysis_focus}</b>"
if analysis_scale:
    context_info += f" | <b>Scale:</b> {analysis_scale}"
if analysis_context:
    context_info += f" | <b>Context:</b> {analysis_context}"
if renewable_types:
    context_info += f" | <b>Renewable:</b> {', '.join(renewable_types)}"
context_info += "</span>"
st.markdown(context_info, unsafe_allow_html=True)
# ============================================================================
# GET DATA INPUTS
# ============================================================================

# Restore correct argument order for get_data_inputs
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

st.markdown("""
<style>
.card-row {
    display: flex;
    gap: 1.5rem;
    margin-bottom: 1.5rem;
}
.card-m3 {
    background: rgba(210,198,250,0.2);
    border-radius: 18px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.04);
    padding: 1.2rem 2rem 1.2rem 2rem;
    flex: 1 1 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-width: 160px;
    min-height: 110px;
}
.card-m3 .card-metric {
    font-size: 2.1rem;
    font-weight: 700;
    color: #4b2996;
    margin-bottom: 0.2rem;
}
.card-m3 .card-label {
    font-size: 1.05rem;
    color: #6b7280;
    font-weight: 500;
    letter-spacing: 0.2px;
}
</style>
<div class='card-row'>
    <div class='card-m3'>
        <div class='card-metric'>{}</div>
        <div class='card-label'>Available Data</div>
    </div>
    <div class='card-m3'>
        <div class='card-metric'>{}</div>
        <div class='card-label'>Missing Data</div>
    </div>
    <div class='card-m3'>
        <div class='card-metric'>{}%</div>
        <div class='card-label'>Avg. Proxy Confidence</div>
    </div>
</div>
""".format(available, missing, avg_conf if avg_conf is not None else 'N/A'), unsafe_allow_html=True)


# ============================================================================
# RENDER DATA INPUTS
# ============================================================================


st.markdown("<hr style='margin: 0.7rem 0 0.7rem 0; border: none; border-top: 1px solid #e2e8f0;'>", unsafe_allow_html=True)
st.markdown("<div style='font-size:1.08rem; font-weight:600; margin-bottom:0.2rem;'>Do you have the following data inputs?</div>", unsafe_allow_html=True)

for category_data in data_inputs:
    category_name = category_data["category"]
    items = category_data["items"]
    
    with st.expander(category_name, expanded=False):
        for item in items:
            _render_data_item(item, page_key, analysis_context)


available = 0

# ============================================================================
# NAVIGATION
# ============================================================================

st.markdown("---")
col1, col2, col3 = st.columns([1, 1, 2])

with col1:
    if st.button("← Back to Step 1", use_container_width=True):
        st.switch_page("pages/1_Define_Scope_and_Context.py")

with col2:
    if st.button("Next: Step 3 →", type="primary", use_container_width=True):
        # TODO: Create Step 3 page
        st.info("Step 3 coming soon!")
        # st.switch_page("pages/3_Analysis_Method.py")

with col3:
    st.markdown(
        "<div style='text-align: right; color: #94a3b8; font-size: 0.9rem; padding-top: 0.5rem;'>"
        "Page 2 of 6</div>",
        unsafe_allow_html=True
    )
