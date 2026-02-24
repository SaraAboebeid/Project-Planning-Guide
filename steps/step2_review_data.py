"""
Step 2: Review Data Inputs

This module renders the data inputs review step of the wizard.
It displays the list of required data inputs based on the analysis type
and focus selected in Step 1.
"""

import streamlit as st
from config.data_inputs import get_data_inputs, get_proxy_options_for_context, get_proxy_confidence


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
        if "step2_cached_renewable_types" not in st.session_state:
            st.session_state.step2_cached_renewable_types = st.session_state.get("renewable_types", [])
        if "step2_cached_urban_design_types" not in st.session_state:
            st.session_state.step2_cached_urban_design_types = st.session_state.get("urban_design_types", [])
        if "step2_cached_climate_resilience_types" not in st.session_state:
            st.session_state.step2_cached_climate_resilience_types = st.session_state.get("climate_resilience_types", [])
        
        # Use cached values
        analysis_type = st.session_state.step2_cached_analysis_type
        analysis_focus = st.session_state.step2_cached_focus
        analysis_scale = st.session_state.step2_cached_scale
        analysis_context = st.session_state.step2_cached_context
        renewable_types = st.session_state.step2_cached_renewable_types
        urban_design_types = st.session_state.step2_cached_urban_design_types
        climate_resilience_types = st.session_state.step2_cached_climate_resilience_types
        
        # Animated step container
        st.markdown("<div class='step-container'>", unsafe_allow_html=True)
        
        st.markdown(
            "<h2 class='slide-in-right' style='font-size: 1.8rem; font-weight: 700; margin-bottom: 1rem; text-align: left;'>"
            "Step 2: Review Data Inputs</h2>",
            unsafe_allow_html=True
        )
        
        # Get the FIXED data list (does not change based on user clicks)
        data_inputs = get_data_inputs(analysis_type, analysis_focus, analysis_scale, analysis_context, renewable_types, urban_design_types, climate_resilience_types)
        
        if not data_inputs:
            st.warning(f"No data inputs configured yet for this analysis type and focus.")
            st.info("Please go back to Step 1 and select a valid combination, or check config/data_inputs.py")
            return
        
        # Create unique session key for this analysis/focus/scale/context/renewable/urban/climate combo
        if isinstance(analysis_type, list):
            analysis_name = "_".join(analysis_type) if analysis_type else "none"
        else:
            analysis_name = analysis_type if analysis_type else "none"
        renewable_str = "_".join(renewable_types) if renewable_types else "none"
        urban_str = "_".join(urban_design_types) if urban_design_types else "none"
        climate_str = "_".join(climate_resilience_types) if climate_resilience_types else "none"
        page_key = f"step2_{analysis_name}_{analysis_focus}_{analysis_scale}_{analysis_context}_{renewable_str}_{urban_str}_{climate_str}".replace(" ", "_").replace("&", "and")
        
        # Initialize responses storage if needed
        if f"{page_key}_responses" not in st.session_state:
            st.session_state[f"{page_key}_responses"] = {}
        
        # Header
        st.subheader("Do you have the following data inputs?")
        if analysis_type:
            # Build the analysis types string
            if isinstance(analysis_type, list) and len(analysis_type) > 1:
                analysis_str = ", ".join(analysis_type)
            elif isinstance(analysis_type, list):
                analysis_str = analysis_type[0] if analysis_type else "None"
            else:
                analysis_str = analysis_type
            
            context_info = f" | **Scale:** {analysis_scale}" if analysis_scale else ""
            context_info += f" | **Context:** {analysis_context}" if analysis_context else ""
            if renewable_types:
                context_info += f" | **Renewable:** {', '.join(renewable_types)}"
            if urban_design_types:
                context_info += f" | **Urban Design:** {', '.join(urban_design_types)}"
            if climate_resilience_types:
                context_info += f" | **Climate:** {', '.join(climate_resilience_types)}"
            
            # Show focus only for Energy & Carbon Performance
            focus_str = ""
            if analysis_focus and "Energy & Carbon Performance" in (analysis_type if isinstance(analysis_type, list) else [analysis_type]):
                focus_str = f" / **{analysis_focus}**"
            
            st.caption(f"Showing data requirements for **{analysis_str}**{focus_str}{context_info}")
        
        st.markdown("<hr style='margin: 1rem 0; border: none; border-top: 1px solid #e2e8f0;'>", unsafe_allow_html=True)
        
        # SUMMARY CARD: Data availability & confidence
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
        total_conf_display = f"{avg_conf}%" if avg_conf is not None else "N/A"

        # Determine confidence color
        if avg_conf is not None:
            if avg_conf >= 85:
                conf_color = "#22c55e"
            elif avg_conf >= 70:
                conf_color = "#f59e0b"
            else:
                conf_color = "#ef4444"
        else:
            conf_color = "#94a3b8"

        st.markdown(f"""
        <style>
        .pg-card-row {{
            display: flex;
            gap: 1.2rem;
            margin: 1.2rem 0 1.5rem 0;
        }}
        .pg-card {{
            flex: 1 1 0;
            border-radius: 14px;
            padding: 1.1rem 1.4rem;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 100px;
            box-shadow: 0 1px 4px rgba(0,0,0,0.06);
        }}
        .pg-card .pg-val {{
            font-size: 2rem;
            font-weight: 700;
            margin-bottom: 0.2rem;
        }}
        .pg-card .pg-lbl {{
            font-size: 0.88rem;
            font-weight: 500;
            color: #6b7280;
        }}
        </style>
        <div class="pg-card-row">
            <div class="pg-card" style="background: rgba(34,197,94,0.10); border: 1px solid rgba(34,197,94,0.25);">
                <div class="pg-val" style="color: #16a34a;">{available}</div>
                <div class="pg-lbl">Available Datasets</div>
            </div>
            <div class="pg-card" style="background: rgba(239,68,68,0.10); border: 1px solid rgba(239,68,68,0.25);">
                <div class="pg-val" style="color: #ef4444;">{missing}</div>
                <div class="pg-lbl">Missing Datasets</div>
            </div>
            <div class="pg-card" style="background: rgba(26,26,26,0.06); border: 1px solid rgba(26,26,26,0.12);">
                <div class="pg-val" style="color: {conf_color};">{total_conf_display}</div>
                <div class="pg-lbl">Total Confidence</div>
            </div>
        </div>
        """, unsafe_allow_html=True)

        # Render the FIXED list of categories and items
        for category_data in data_inputs:
            category_name = category_data["category"]
            items = category_data["items"]
            with st.expander(category_name, expanded=False):
                for item in items:
                    _render_data_item(item, page_key, analysis_context)

        # Close step container
        st.markdown("</div>", unsafe_allow_html=True)


def _render_data_item(item: dict, page_key: str, context: str = None):
    """
    Render a single data item with Yes/No selection for data availability.
    
    Args:
        item: The data item dictionary with key, label, recommended_source, proxy_options
        page_key: Unique key prefix for session state
        context: The selected context/country for context-aware proxy options
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
    st.markdown(f"<span style='font-size: 0.85rem; color: #64748b;'>*Recommended data source:* {recommended_source}</span>", unsafe_allow_html=True)
    
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
        st.success("Using recommended source")
    else:
        # Show proxy options
        if proxy_options:
            proxy_key = f"{page_key}_{item_key}_proxy"
            selected_proxy = st.selectbox("Select proxy:", options=proxy_options, key=proxy_key)
            
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
                source_badge = "Estimated" if confidence_source == "estimated" else "Validated"
                st.markdown(
                    f"<div style='display: flex; align-items: center; gap: 8px; margin-top: 4px;'>"
                    f"<span style='font-size: 0.9rem;'>Confidence: </span>"
                    f"<span style='background-color: {color}; color: white; padding: 2px 8px; border-radius: 4px; font-weight: 600;'>{confidence_val}% ({level})</span>"
                    f"<span style='font-size: 0.75rem; color: #94a3b8; cursor: help;' title='{confidence_ref}'>{source_badge}</span>"
                    f"</div>",
                    unsafe_allow_html=True
                )
            else:
                st.caption("Confidence not yet estimated for this proxy")
        else:
            st.caption("No proxy options available yet")
    
    # Separator
    st.markdown("---")


def render_step2_navigation():
    """Render navigation buttons for Step 2."""
    col1, col2_nav, col3 = st.columns([1, 1, 2])
    
    with col1:
        if st.button("Back", use_container_width=True, key="nav_back_2"):
            # Clear cached values so they refresh from Step 1
            st.session_state.pop("step2_cached_analysis_type", None)
            st.session_state.pop("step2_cached_focus", None)
            st.session_state.pop("step2_cached_scale", None)
            st.session_state.pop("step2_cached_context", None)
            st.session_state.pop("step2_cached_renewable_types", None)
            st.session_state.pop("step2_cached_urban_design_types", None)
            st.session_state.pop("step2_cached_climate_resilience_types", None)
            st.session_state.wizard_step = 1
            st.rerun()
    
    with col2_nav:
        if st.button("Continue", type="primary", use_container_width=True, key="nav_next_2"):
            st.session_state.wizard_step = 3
            st.rerun()
    
    with col3:
        st.markdown(
            "<div style='text-align: right; color: #94a3b8; font-size: 0.85rem; padding-top: 0.5rem;'>"
            "Step 2 of 6</div>",
            unsafe_allow_html=True
        )
