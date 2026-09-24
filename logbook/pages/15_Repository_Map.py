"""Repository map - renders CODEMAP.md live from the repository root.

Deliberately not a copy: the map is version-controlled next to the code it
describes, so rendering it here means the logbook cannot drift from it.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import streamlit as st  # noqa: E402

from logbook_content import PAGES  # noqa: E402
from scripts.ui_utils import (  # noqa: E402
    REPO_ROOT,
    badge,
    file_link_html,
    inject_css,
    linkify_markdown,
    linkify_repo_links,
    make_markdown_download,
    overview_card,
    page_header,
)

page = PAGES["script_browser"]

st.set_page_config(page_title=page["title"], layout="wide")
inject_css()
page_header(page["number"], page["title"], page.get("stage"))
st.markdown(page["purpose"])

if page.get("overview"):
    ov = page["overview"]
    overview_card(ov["title"], ov.get("subtitle", ""), ov["items"])

for sec in page.get("sections", []):
    with st.expander(sec["title"], expanded=False):
        if sec.get("badge"):
            st.markdown(badge(sec["badge"]), unsafe_allow_html=True)
        if sec.get("body"):
            st.markdown(linkify_markdown(sec["body"]))
        if sec.get("files"):
            st.markdown("<span class='lb-dim'>Scripts:</span> "
                        + " · ".join(file_link_html(rel) for rel in sec["files"]),
                        unsafe_allow_html=True)

codemap = REPO_ROOT / "CODEMAP.md"

if not codemap.exists():
    st.error(
        "`CODEMAP.md` was not found at the repository root. "
        "This page renders that file; without it there is nothing to show."
    )
    st.stop()

text = codemap.read_text(encoding="utf-8", errors="replace")
stat = codemap.stat()

c1, c2, c3 = st.columns(3)
c1.metric("Lines", f"{text.count(chr(10)) + 1:,}")
c2.metric("Size", f"{stat.st_size / 1024:.1f} KB")
c3.metric("Sections", str(text.count(chr(10) + "## ")))

query = st.text_input(
    "Filter by file or keyword",
    placeholder="e.g. data_pipeline, cesium, tools/uk, EPSM",
).strip()

st.divider()

if query:
    hits = [ln for ln in text.splitlines() if query.lower() in ln.lower()]
    st.caption(f"{len(hits)} matching line(s) in CODEMAP.md")
    st.markdown(linkify_repo_links(chr(10).join(hits)) if hits else "_No matches._")
else:
    # every file named in the map opens in the Script Explorer
    st.markdown(linkify_repo_links(text))

st.divider()
make_markdown_download(page)
