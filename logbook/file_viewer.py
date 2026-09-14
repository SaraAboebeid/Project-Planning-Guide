"""File viewer — opens a script or data file that the logbook cites.

Every file path on the other pages links here as ``file?path=<repo path>``.
Scripts are shown in full with syntax highlighting; data files get a preview
suited to their format (see scripts/file_preview.py). Read-only, and limited to
files the logbook cites - see ``ui_utils.is_allowed``.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import streamlit as st  # noqa: E402

from scripts.file_preview import render_file  # noqa: E402
from scripts.ui_utils import cited_paths, inject_css, is_allowed  # noqa: E402

st.set_page_config(page_title="File viewer", layout="wide")
inject_css()
st.title("File viewer")
st.markdown(
    "Opens any script or data file the logbook cites — the version on disk now, "
    "read-only. Scripts are shown in full; data files get a preview of their "
    "contents: tables and sample rows, records, weather-file summaries. Every file "
    "path on the other pages links here."
)

options = list(cited_paths())
current = st.query_params.get("path", "")
if current and current not in options and is_allowed(current):
    options.insert(0, current)          # a file inside a cited folder

choice = st.selectbox(
    f"File ({len(options)} cited)",
    options,
    index=options.index(current) if current in options else None,
    placeholder="Choose or type a file name…",
)
if choice and choice != current:
    st.query_params["path"] = choice
    current = choice

if not current:
    st.info("Pick a file above, or follow a file link on any logbook page.")
    st.stop()

render_file(current)
