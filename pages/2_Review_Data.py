import streamlit as st
from config.data_inputs import get_data_inputs

st.set_page_config(page_title="Review Data", page_icon="📊", layout="wide")

st.title("📊 Review Data")

# Check if page 1 was completed
if "analysis_type" not in st.session_state or not st.session_state.analysis_type:
    st.warning("Please complete Step 1 first: Define Scope and Context")
    st.stop()

if "analysis_focus" not in st.session_state or not st.session_state.analysis_focus:
    st.warning("Please select an Analysis Focus in Step 1")
    st.stop()

# Get selections from page 1
analysis_type = st.session_state.analysis_type[0] if isinstance(st.session_state.analysis_type, list) else st.session_state.analysis_type
analysis_focus = st.session_state.get("analysis_focus") or st.session_state.get("energy_system_focus", "")
analysis_scale = st.session_state.get("analysis_scale") or st.session_state.get("project_scale", "")
analysis_context = st.session_state.get("analysis_context") or st.session_state.get("country", "")

context_info = f"**Analysis Type:** {analysis_type} | **Focus:** {analysis_focus}"
if analysis_scale:
    context_info += f" | **Scale:** {analysis_scale}"
if analysis_context:
    context_info += f" | **Context:** {analysis_context}"
st.info(context_info)

# ============================================================================
# INITIALIZE SESSION STATE FOR THIS PAGE
# ============================================================================

# Create a unique key for this analysis type + focus + scale + context combination
page_key = f"page2_{analysis_type}_{analysis_focus}_{analysis_scale}_{analysis_context}".replace(" ", "_").replace("&", "and")

# Initialize session state for storing user responses if not exists
if page_key not in st.session_state:
    st.session_state[page_key] = {}

# ============================================================================
# GET THE DATA INPUTS (FIXED LIST - DOES NOT CHANGE)
# ============================================================================

data_inputs = get_data_inputs(analysis_type, analysis_focus, analysis_scale, analysis_context)

if not data_inputs:
    st.warning(f"No data inputs configured yet for {analysis_type} → {analysis_focus}")
    st.stop()

# ============================================================================
# RENDER THE DATA INPUTS
# ============================================================================

st.markdown("---")
st.subheader("Data Inputs Required")
st.markdown("For each data input, indicate if you have the data, select the source, or choose a proxy if needed.")

for category_data in data_inputs:
    category_name = category_data["category"]
    items = category_data["items"]
    
    st.markdown(f"### {category_name}")
    
    for item in items:
        item_key = item["key"]
        item_label = item["label"]
        item_type = item.get("type", "standard")
        recommended_source = item.get("recommended_source", "")
        proxy_options = item.get("proxy_options", [])
        
        # Create a container for this item
        with st.container():
            st.markdown(f"**{item_label}**")
            
            col1, col2, col3 = st.columns([1, 2, 2])
            
            # Column 1: Recommended source (display only)
            with col1:
                if recommended_source:
                    st.caption(f"Recommended: {recommended_source}")
                else:
                    st.caption("Recommended: TBD")
            
            # Column 2: Toggle between Recommended and Proxy
            with col2:
                use_proxy_key = f"{page_key}_{item_key}_use_proxy"
                use_proxy = st.checkbox("Use Proxy instead", key=use_proxy_key)
            
            # Column 3: Proxy dropdown (if proxy is selected)
            with col3:
                if use_proxy:
                    proxy_key = f"{page_key}_{item_key}_proxy"
                    if proxy_options:
                        st.selectbox("Select Proxy", options=proxy_options, key=proxy_key)
                    else:
                        st.text_input("Proxy (options TBD)", key=proxy_key, disabled=True)
            
            # Handle yes/no type questions
            if item_type == "yes_no":
                yes_no_key = f"{page_key}_{item_key}_yesno"
                followup_label = item.get("followup_label", "Additional input")
                
                answer = st.radio(
                    "Response",
                    options=["Yes", "No"],
                    key=yes_no_key,
                    horizontal=True
                )
                
                # Show followup input if Yes is selected
                if answer == "Yes":
                    followup_key = f"{page_key}_{item_key}_followup"
                    st.text_input(followup_label, key=followup_key)
            
            st.markdown("---")

# ============================================================================
# NAVIGATION
# ============================================================================

st.markdown("---")
col_prev, col_next = st.columns(2)

with col_prev:
    if st.button("← Back to Step 1"):
        st.switch_page("pages/1_Define_Scope_and_Context.py")

with col_next:
    if st.button("Continue to Step 3 →"):
        st.switch_page("pages/3_Confidence_and_Recommendations.py")
