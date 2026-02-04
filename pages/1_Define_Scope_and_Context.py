import streamlit as st

st.set_page_config(layout="wide")

st.title("Step 1: Define Scope & Context")
st.markdown("<p style='font-size: 1.1rem; color: #64748b; margin-top: -0.5rem; margin-bottom: 1.5rem;'>Select the analysis type, focus, and basic context for the plan.</p>", unsafe_allow_html=True)

# Keep state
if "wizard_step" not in st.session_state:
    st.session_state.wizard_step = 1

# ----- Analysis selections -----
st.markdown("### Analysis Setup")

# Supported analysis types for this wizard
analysis_options = [
    "Energy & Carbon Performance",
    "Renewable Energy & Local Production",
    "Climate Resilience",
]

selected_analysis = st.selectbox(
    "Analysis Type",
    options=analysis_options,
    help="Choose the primary analysis focus for this project."
)

# Persist as list to match downstream expectations
st.session_state["analysis_type"] = [selected_analysis]

# Focus options depend on analysis type (starting with Electricity for E&C)
focus_label = "Focus"
focus_options = []
if selected_analysis == "Energy & Carbon Performance":
    focus_options = ["Electricity", "Heating", "Cooling"]
elif selected_analysis == "Renewable Energy & Local Production":
    focus_options = ["Solar PV", "Battery Storage", "Other"]
elif selected_analysis == "Climate Resilience":
    focus_options = ["Thermal Comfort", "Heat Stress", "Other"]

selected_focus = st.selectbox(
    focus_label,
    options=focus_options,
    help="If applicable, pick the specific sub-focus for the analysis."
)

st.session_state["analysis_focus"] = selected_focus

# Optional basic context
st.markdown("### Project Context")
col_a, col_b = st.columns(2)
with col_a:
    st.session_state["project_name"] = st.text_input("Project Name", value=st.session_state.get("project_name", ""))
with col_b:
    st.session_state["location"] = st.text_input("Location / Address", value=st.session_state.get("location", ""))

# Navigation
col1, col2 = st.columns([1, 1])
with col1:
    if st.button("⬅️ Back to Home"):
        st.switch_page("planning_guide.py")
with col2:
    if st.button("Next Step ➡️", type="primary"):
        st.switch_page("pages/2_Review_Data.py")
