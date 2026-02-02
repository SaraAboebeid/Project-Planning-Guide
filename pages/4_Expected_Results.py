import streamlit as st

st.set_page_config(layout="wide")

st.title("Step 4: Expected Results")
st.markdown("<p style='font-size: 1.1rem; color: #64748b; margin-top: -0.5rem; margin-bottom: 1.5rem;'>Review expected outcomes.</p>", unsafe_allow_html=True)

# Keep state
if "wizard_step" not in st.session_state:
    st.session_state.wizard_step = 4

# Navigation
col1, col2 = st.columns([1, 1])
with col1:
    if st.button("⬅️ Previous Step"):
        st.switch_page("pages/3_Confidence_and_Recommendations.py")
with col2:
    if st.button("Next Step ➡️", type="primary"):
        st.switch_page("pages/5_Generate_Plan.py")

# Placeholder for content
st.info("Content for expected results goes here.")
