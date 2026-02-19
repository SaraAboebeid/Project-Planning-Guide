"""
Page 3: Analysis Method

Choose the analysis method appropriate for the selected scope, context and available data.
This is an initial scaffold — we can extend it to show data-driven recommendations.
"""

import streamlit as st

st.set_page_config(page_title="Select Analysis Method", layout="wide")

if "analysis_type" not in st.session_state or not st.session_state.analysis_type:
    st.warning("⚠️ Please complete Step 1 first: Define Scope and Context")
    if st.button("Go to Step 1"):
        st.switch_page("pages/1_Define_Scope_and_Context.py")
    st.stop()

# Pull selections from session state
analysis_type = st.session_state.get("analysis_type", [])
analysis_type_str = analysis_type[0] if isinstance(analysis_type, list) and analysis_type else (analysis_type or "None")
analysis_focus = st.session_state.get("analysis_focus") or st.session_state.get("energy_system_focus", "")
analysis_scale = st.session_state.get("analysis_scale") or st.session_state.get("project_scale", "")
analysis_context = st.session_state.get("analysis_context") or st.session_state.get("country", "")

st.markdown("<h2 style='font-size:1.35rem; font-weight:700; margin-bottom:0.25rem;'>Step 3: Choose Analysis Method</h2>", unsafe_allow_html=True)
st.markdown(f"<div style='color:#64748b; margin-bottom:0.6rem;'>Analysis: <b>{analysis_type_str}</b> — {analysis_focus} | Scale: {analysis_scale} | Context: {analysis_context}</div>", unsafe_allow_html=True)

st.markdown("""
Select the analysis approach you want to use. We'll use your available data in Step 2 to refine this recommendation.
""")

# Simple method options for the scaffold
method_options = [
    "Detailed Simulation (high fidelity)",
    "Simplified Estimate (reduced inputs)",
    "Benchmarking / Comparative Analysis"
]

# Provide a gentle default based on analysis type
default_index = 0
if "Renewable" in analysis_type_str:
    default_index = 1
elif "Climate" in analysis_type_str or "Resilience" in analysis_type_str:
    default_index = 0

selected_method = st.radio("Choose method:", method_options, index=default_index)

st.markdown("---")

st.markdown("**Recommendation**:")
if selected_method == method_options[0]:
    st.info("Detailed Simulation provides the most accurate results but requires richer datasets (geometry, time series, system specs).")
elif selected_method == method_options[1]:
    st.info("Simplified Estimates work well when you have partial data and need faster results.")
else:
    st.info("Benchmarking is useful for comparative studies and quick policy-level insights.")

st.markdown("---")

col1, col2 = st.columns([1, 1])
with col1:
    if st.button("← Back to Step 2", use_container_width=True):
        st.switch_page("pages/2_Review_Data.py")

with col2:
    if st.button("Next: Step 4 →", type="primary", use_container_width=True):
        st.info("Step 4 coming soon — we'll wire this up to the selected method.")

st.markdown("\n\n---\n\nThis page is a starting point. Tell me which features you'd like: data-driven recommendations, example workflows per method, or automated method selection based on Step 2 availability.")
