import streamlit as st

st.set_page_config(layout="wide")

st.title("Step 5: Generate Plan")
st.markdown("<p style='font-size: 1.1rem; color: #64748b; margin-top: -0.5rem; margin-bottom: 1.5rem;'>Finalize and export your project plan.</p>", unsafe_allow_html=True)

# Keep state
if "wizard_step" not in st.session_state:
    st.session_state.wizard_step = 5

# Navigation
col1, col2 = st.columns([1, 1])
with col1:
    if st.button("⬅️ Previous Step"):
        st.switch_page("pages/4_Expected_Results.py")
with col2:
    if st.button("Start Over", type="primary"):
        st.switch_page("planning_guide.py")

# Placeholder for content
st.info("Content for generating the plan goes here.")
