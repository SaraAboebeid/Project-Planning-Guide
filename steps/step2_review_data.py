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
        # Cache the Step 1 selections when we first enter Step 2
        # This prevents them from being lost when radio buttons trigger reruns
        if "step2_cached_analysis_type" not in st.session_state:
            st.session_state.step2_cached_analysis_type = st.session_state.get("analysis_type", [])
        if "step2_cached_focus" not in st.session_state:
            st.session_state.step2_cached_focus = (
                st.session_state.get("analysis_focus", "") or 
                st.session_state.get("energy_system_focus", "")
            )
        if "step2_cached_scale" not in st.session_state:
            st.session_state.step2_cached_scale = st.session_state.get("project_scale", "")
        if "step2_cached_context" not in st.session_state:
            st.session_state.step2_cached_context = st.session_state.get("country", "")
        
        # Use cached values
        analysis_type = st.session_state.step2_cached_analysis_type
        analysis_focus = st.session_state.step2_cached_focus
        analysis_scale = st.session_state.step2_cached_scale
        analysis_context = st.session_state.step2_cached_context
        
        st.markdown(
            "<h2 style='font-size: 1.8rem; font-weight: 700; margin-bottom: 1rem; text-align: left;'>"
            "Step 2: Review Data Inputs</h2>",
            unsafe_allow_html=True
        )
        
        # Get the FIXED data list (does not change based on user clicks)
        data_inputs = get_data_inputs(analysis_type, analysis_focus, analysis_scale, analysis_context)
        
        if not data_inputs:
            st.warning(f"No data inputs configured yet for this analysis type and focus.")
            st.info("Please go back to Step 1 and select a valid combination, or check config/data_inputs.py")
            return
        
        # Create unique session key for this analysis/focus/scale/context combo
        analysis_name = analysis_type[0] if analysis_type else "none"
        page_key = f"step2_{analysis_name}_{analysis_focus}_{analysis_scale}_{analysis_context}".replace(" ", "_").replace("&", "and")
        
        # Initialize responses storage if needed
        if f"{page_key}_responses" not in st.session_state:
            st.session_state[f"{page_key}_responses"] = {}
        
        # Header
        st.subheader("Do you have the following data inputs?")
        if analysis_type:
            context_info = f" | **Scale:** {analysis_scale}" if analysis_scale else ""
            context_info += f" | **Context:** {analysis_context}" if analysis_context else ""
            st.caption(f"Showing data requirements for **{analysis_type[0]}** → **{analysis_focus}**{context_info}")
        
        st.markdown("<hr style='margin: 1rem 0; border: none; border-top: 1px solid #e2e8f0;'>", unsafe_allow_html=True)
        
        # Render the FIXED list of categories and items
        for category_data in data_inputs:
            category_name = category_data["category"]
            items = category_data["items"]
            
            with st.expander(category_name, expanded=False):
                for item in items:
                    _render_data_item(item, page_key)


def _render_data_item(item: dict, page_key: str):
    """
    Render a single data item with Yes/No selection for data availability.
    """
    item_key = item["key"]
    item_label = item["label"]
    item_type = item.get("type", "standard")
    recommended_source = item.get("recommended_source", "") or "To be defined"
    proxy_options = item.get("proxy_options", [])
    
    # Data item label
    st.markdown(f"**{item_label}**")
    
    # Show recommended source
    st.markdown(f"*Recommended:* {recommended_source}")
    
    # Simple Yes/No radio - default to Yes
    has_data_key = f"{page_key}_{item_key}_has_data"
    has_data = st.radio(
        "Do you have this data?",
        options=["Yes", "No"],
        key=has_data_key,
        horizontal=True,
        index=0  # Default to Yes
    )
    
    if has_data == "Yes":
        st.success("✓ Using recommended source")
    else:
        # Show proxy options
        if proxy_options:
            proxy_key = f"{page_key}_{item_key}_proxy"
            st.selectbox("Select proxy:", options=proxy_options, key=proxy_key)
        else:
            st.caption("⚠️ No proxy options available yet")
    
    # Separator
    st.markdown("---")


def render_step2_navigation():
    """Render navigation buttons for Step 2."""
    nav_col1, nav_col2, nav_col3, nav_col4 = st.columns([1, 1, 2, 2])
    
    with nav_col1:
        if st.button("◀ Back", use_container_width=True, key="nav_back_2"):
            # Clear cached values so they refresh from Step 1
            st.session_state.pop("step2_cached_analysis_type", None)
            st.session_state.pop("step2_cached_focus", None)
            st.session_state.pop("step2_cached_scale", None)
            st.session_state.pop("step2_cached_context", None)
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
