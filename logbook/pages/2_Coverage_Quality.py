"""Coverage & Quality (Sweden / United Kingdom tabs) - layout only.

The text for this page lives in ``logbook_content.py`` under the key
``"coverage"``. Edit it there; nothing in this file needs to change.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import streamlit as st  # noqa: E402

from logbook_content import PAGES  # noqa: E402
from scripts.motifs import epc_strip  # noqa: E402
from scripts.ui_utils import render_page  # noqa: E402


def ladder() -> None:
    """The A-G scale, in the viewer's own colours. This whole page is an
    argument about how many buildings have one of these letters, so it is
    worth showing the letters."""
    st.markdown(epc_strip("The scale this page is counting"),
                unsafe_allow_html=True)
    st.write("")


render_page(PAGES["coverage"], extra=ladder)
