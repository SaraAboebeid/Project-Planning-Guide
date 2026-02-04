"""
Step 2: Review Data Inputs

This module renders the data inputs review step of the wizard.
It displays the list of required data inputs based on the analysis type
and focus selected in Step 1.
"""

import streamlit as st
from config.data_inputs import get_data_inputs


def render_step2(col2):
    """
    Render Step 2: Review Data Inputs
    
    Args:
        col2: The Streamlit column to render the content in
    """
    with col2:
        # Get selections from Step 1
        analysis_type = st.session_state.get("analysis_type", [])
        analysis_focus = st.session_state.get("analysis_focus", "") or st.session_state.get("energy_system_focus", "")
        
        st.markdown(
            "<h2 style='font-size: 1.8rem; font-weight: 700; margin-bottom: 1rem; text-align: left;'>"
            "Step 2: Review Data Inputs</h2>",
            unsafe_allow_html=True
        )
    
    # Get the FIXED data list (does not change based on user clicks)
    data_inputs = get_data_inputs(analysis_type, analysis_focus)
    
    if not data_inputs:
        st.warning(f"No data inputs configured yet for this analysis type and focus.")
        st.info("Please go back to Step 1 and select a valid combination, or check config/data_inputs.py")
        return
    
    # Create unique session key for this analysis/focus combo
    analysis_name = analysis_type[0] if analysis_type else "none"
    page_key = f"step2_{analysis_name}_{analysis_focus}".replace(" ", "_").replace("&", "and")
    
    # Initialize responses storage if needed
    if f"{page_key}_responses" not in st.session_state:
        st.session_state[f"{page_key}_responses"] = {}
    
    # Header
    st.subheader("Do you have the following data inputs?")
    if analysis_type:
        st.caption(f"Showing data requirements for **{analysis_type[0]}** → **{analysis_focus}**")
    
    st.markdown("<hr style='margin: 1rem 0; border: none; border-top: 1px solid #e2e8f0;'>", unsafe_allow_html=True)
    
    # Render the FIXED list of categories and items
    for category_data in data_inputs:
        category_name = category_data["category"]
        items = category_data["items"]
        
        with st.expander(category_name, expanded=True):
            for item in items:
                _render_data_item(item, page_key)


def _render_data_item(item: dict, page_key: str):
    """
    Render a single data item with its controls.
    
    Args:
        item: The item configuration dictionary
        page_key: Unique key prefix for session state
    """
    item_key = item["key"]
    item_label = item["label"]
    item_type = item.get("type", "standard")
    recommended_source = item.get("recommended_source", "")
    proxy_options = item.get("proxy_options", [])
    
    st.markdown(f"**{item_label}**")
    
    col1, col2, col3 = st.columns([1, 2, 2])
    
    # Column 1: Recommended source
    with col1:
        if recommended_source:
            st.caption(f"Recommended: {recommended_source}")
        else:
            st.caption("Recommended: TBD")
    
    # Column 2: Use Proxy toggle
    with col2:
        use_proxy_key = f"{page_key}_{item_key}_use_proxy"
        use_proxy = st.checkbox("Use Proxy instead", key=use_proxy_key)
    
    # Column 3: Proxy dropdown if toggled
    with col3:
        if use_proxy:
            proxy_select_key = f"{page_key}_{item_key}_proxy"
            if proxy_options:
                st.selectbox("Select Proxy", options=proxy_options, key=proxy_select_key)
            else:
                st.text_input("Proxy (options TBD)", key=proxy_select_key, disabled=True)
    
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
        
        # Show followup if Yes
        if answer == "Yes":
            followup_key = f"{page_key}_{item_key}_followup"
            st.text_input(followup_label, key=followup_key)
    
    # Separator
    st.markdown(
        "<div style='margin: 0.6rem 0; border-bottom: 1px solid #e2e8f0;'></div>",
        unsafe_allow_html=True
    )


def render_step2_navigation():
    """Render navigation buttons for Step 2."""
    nav_col1, nav_col2, nav_col3, nav_col4 = st.columns([1, 1, 2, 2])
    
    with nav_col1:
        if st.button("◀ Back", use_container_width=True, key="nav_back_2"):
            st.session_state.wizard_step = 1
            st.rerun()
    
    with nav_col2:
        if st.button("Next ▶", type="primary", use_container_width=True, key="nav_next_2"):
            st.session_state.wizard_step = 3
            st.rerun()
    
    with nav_col3:
        st.markdown(
            "<div style='text-align: left; color: #94a3b8; font-size: 0.9rem; padding-top: 0.5rem;'>"
            "Page 2/6</div>",
            unsafe_allow_html=True
        )
