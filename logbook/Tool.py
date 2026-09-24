"""Project Planning Guide - logbook entry point.

Run with ``run.bat`` (or ``streamlit run Tool.py``) from the ``logbook`` folder.

This file only builds the sidebar: one entry per topic, in the groups and order
given by ``NAV`` at the bottom of ``logbook_content.py``. Where Sweden and the UK
differ (data sources, coverage, pipelines) the split is not in the sidebar but
on the page itself, as a Sweden / United Kingdom tab pair - see ``render_page``.
The home page is ``home.py``, listed first as "Tool".

Using st.navigation switches off Streamlit's automatic ``pages/`` discovery, so
a page only appears if NAV lists it (check_content.py verifies NAV covers every
page exactly once).
"""
import sys
from pathlib import Path

LOGBOOK_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(LOGBOOK_DIR))

import streamlit as st  # noqa: E402

from logbook_content import NAV, PAGES  # noqa: E402

PAGES_DIR = LOGBOOK_DIR / "pages"


def _page_file(key: str) -> Path:
    """pages/<number>_<Name>.py for a PAGES key."""
    number = PAGES[key]["number"]
    hits = sorted(PAGES_DIR.glob(f"{number}_*.py"))
    if not hits:
        raise FileNotFoundError(f"no pages/{number}_*.py for page '{key}'")
    return hits[0]


navigation = {
    "Overview": [st.Page(LOGBOOK_DIR / "home.py", title="Tool", default=True)],
}
for header, keys in NAV:
    navigation[header] = [
        st.Page(
            _page_file(key),
            title=PAGES[key].get("nav_title", PAGES[key]["title"]),
            url_path=key.replace("_", "-"),
        )
        for key in keys
    ]

# The two interactive, unnumbered tools sit with the data they open, directly
# after Data Sources - not in Reference: a reader who has just seen where a
# dataset comes from wants to look inside it, or at the script that built it.
# Data first, then the scripts behind it, which is the order of that sentence.
#
# url_path stays "file" for the script explorer: every file citation in the
# logbook is built as "file?path=<repo path>" (ui_utils.VIEWER_URL), so changing
# it would break every one of those links. Only the label changed.
_tools = [
    st.Page(LOGBOOK_DIR / "data_explorer.py", title="Data Explorer", url_path="data-explorer"),
    st.Page(LOGBOOK_DIR / "file_viewer.py", title="Script Explorer", url_path="file"),
]
_group = navigation.setdefault("Data & pipelines", [])
_after = next((i for i, p in enumerate(_group) if p.url_path == "data-sources"), len(_group) - 1)
_group[_after + 1:_after + 1] = _tools

# expanded=True, or Streamlit collapses the longer groups behind a "View 10
# more" link once anything else shares the sidebar - the whole contents list
# being visible at once is the point of this sidebar.
nav = st.navigation(navigation, expanded=True)

# The planner carries a bright/dark toggle in its sidebar. Streamlit owns its
# own theme switch (it has to: st.dataframe is drawn by Streamlit, not by our
# CSS, so a toggle of our own could not follow), and a page cannot set it from
# Python - so point at it rather than duplicate it. inject_css() reads the
# chosen mode through st.context.theme and restyles to match.
st.sidebar.caption("Bright or dark: **⋮ → Settings → Appearance**")

nav.run()
