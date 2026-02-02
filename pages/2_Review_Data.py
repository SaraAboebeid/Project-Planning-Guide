import streamlit as st

st.set_page_config(layout="wide")

st.title("Step 2: Review Data")
st.markdown("<p style='font-size: 1.1rem; color: #64748b; margin-top: -0.5rem; margin-bottom: 1.5rem;'>Mark availability and select proxies.</p>", unsafe_allow_html=True)

# Keep state
if "wizard_step" not in st.session_state:
    st.session_state.wizard_step = 2

# Navigation
col1, col2 = st.columns([1, 1])
with col1:
    if st.button("⬅️ Previous Step"):
        st.switch_page("pages/1_Define_Scope_and_Context.py")
with col2:
    if st.button("Next Step ➡️", type="primary"):
        st.switch_page("pages/3_Confidence_and_Recommendations.py")

# Placeholder for content from the original file
st.info("Content for reviewing data goes here.")
