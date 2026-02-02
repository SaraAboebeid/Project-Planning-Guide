import streamlit as st

st.set_page_config(layout="wide")

st.title("Step 1: Define Scope & Context")
st.markdown("<p style='font-size: 1.1rem; color: #64748b; margin-top: -0.5rem; margin-bottom: 1.5rem;'>Select the analysis type, project scale, and provide context for the plan.</p>", unsafe_allow_html=True)

# Keep state
if "wizard_step" not in st.session_state:
    st.session_state.wizard_step = 1

# Navigation
col1, col2 = st.columns([1, 1])
with col1:
    if st.button("⬅️ Back to Home"):
        st.switch_page("planning_guide.py")
with col2:
    if st.button("Next Step ➡️", type="primary"):
        st.switch_page("pages/2_Review_Data.py")

st.markdown("### Analysis Type")
# Placeholder for content from the original file
# You can copy the relevant sections for step 1 here.
st.info("Content for defining scope and context goes here.")
