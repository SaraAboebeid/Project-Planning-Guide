"""Logbook home page — shown first in the sidebar, as "Tool".

Moved out of Tool.py when the sidebar became country-grouped: Tool.py now only
builds the navigation. The contents cards below follow the same NAV groups as
the sidebar, so the two cannot disagree.
"""
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import pandas as pd  # noqa: E402
import streamlit as st  # noqa: E402

from logbook_content import NAV, PAGES  # noqa: E402
from scripts.ui_utils import REPO_ROOT, badge, inject_css, show_dataframe_safe  # noqa: E402

st.set_page_config(page_title="Planning Guide Logbook", layout="wide")
inject_css()

st.title("Project Planning Guide — Logbook")
st.markdown(
    "A stage-by-stage record of how this decision-support tool is built: the data "
    "it ingests, how that data is processed, how buildings are simulated, and how "
    "renovation options are ranked and chosen. Each page exports itself as "
    "Markdown, so the logbook doubles as a source for reports and appendices."
)
st.info(
    "This project is a continuation of **DT4PED — Digital Twin for Positive "
    "Energy Districts**, upscaling that approach from a single district to "
    "national and European level. See **17. Project Team & Credits**.",
    icon="🧭",
)

# ── contents, grouped exactly like the sidebar ───────────────────────────────
st.subheader("Contents")
st.caption(
    "Sweden and the United Kingdom are built by separate chains from different "
    "sources, so the three topics where they differ — data sources, coverage "
    "and pipelines — have a Sweden tab and a United Kingdom tab. Everything else "
    "applies to both."
)

CARDS_PER_ROW = 4
for group, keys in NAV:
    st.markdown(f"**{group}**")
    for start in range(0, len(keys), CARDS_PER_ROW):
        row = keys[start:start + CARDS_PER_ROW]
        cols = st.columns(CARDS_PER_ROW)
        for col, key in zip(cols, row):
            page = PAGES[key]
            with col:
                st.markdown(
                    f"{badge(page['stage'])}<br><strong>{page['number']}. "
                    f"{page['title']}</strong>",
                    unsafe_allow_html=True,
                )
                # Strip markdown before truncating, or a cut mid-token leaves a
                # stray backtick or asterisk visible in the card. Backticks and
                # asterisks only — underscores are literal here (data_pipeline.py).
                plain = re.sub(r"[`*]", "", " ".join(page["purpose"].split()))
                st.caption(plain[:118].rstrip() + "…")
                if page.get("tabs"):
                    st.caption("Tabs: " + " · ".join(label for label, _ in page["tabs"]))
    st.write("")

st.divider()

# ── live repository state ────────────────────────────────────────────────────
st.subheader("Repository state")
st.caption(
    "Read from disk each time this page loads, so the logbook reports what is "
    "actually there rather than what was true when it was written."
)


@st.cache_data(show_spinner=False)
def repo_snapshot() -> dict:
    def count(pattern: str, root: str = ".") -> int:
        base = REPO_ROOT / root
        if not base.exists():
            return 0
        return sum(1 for _ in base.rglob(pattern))

    try:
        commit = subprocess.run(
            ["git", "log", "-1", "--format=%h %ad %s", "--date=short"],
            cwd=REPO_ROOT, capture_output=True, text=True, timeout=10,
        ).stdout.strip()
    except Exception:
        commit = "unavailable"
    try:
        branch = subprocess.run(
            ["git", "rev-parse", "--abbrev-ref", "HEAD"],
            cwd=REPO_ROOT, capture_output=True, text=True, timeout=10,
        ).stdout.strip()
    except Exception:
        branch = "unavailable"

    return {
        "branch": branch,
        "commit": commit,
        "backend_py": count("*.py", "backend"),
        "viewer_js": count("*.js", "viewer/js"),
        "frontend_tsx": count("*.tsx", "frontend/src"),
        "tools_py": count("*.py", "tools"),
    }


snap = repo_snapshot()
c1, c2, c3, c4 = st.columns(4)
c1.metric("Backend modules", snap["backend_py"])
c2.metric("Viewer scripts", snap["viewer_js"])
c3.metric("React components/pages", snap["frontend_tsx"])
c4.metric("Pipeline tools", snap["tools_py"])

st.caption(f"Branch **{snap['branch']}** · last commit `{snap['commit']}`")

# ── does the code this logbook describes still exist? ────────────────────────
st.subheader("Consistency check")

KEY_PATHS = [
    ("Code map", "CODEMAP.md"),
    ("Core pipeline", "data_pipeline.py"),
    ("Viewer build", "build.py"),
    ("Backend API", "backend/main.py"),
    ("Shoebox IDF generator", "tools/idf/generate_idf.py"),
    ("Prioritisation model", "frontend/src/utils/retrofitPriority.ts"),
    ("Regret analysis", "frontend/src/utils/regretAnalysis.ts"),
    ("EPSM stack", "docker-compose.epsm.yml"),
    ("EPC register", "data/sensitivity/epc_sweden.duckdb"),
    ("Simulation cache", "data/simulation_database.sqlite3"),
]

rows = []
for label, rel in KEY_PATHS:
    exists = (REPO_ROOT / rel).exists()
    rows.append({"What": label, "Path": rel, "Present": "yes" if exists else "NO"})

df = pd.DataFrame(rows)
missing = df[df["Present"] == "NO"]
show_dataframe_safe(df)

if missing.empty:
    st.success("Every file this logbook depends on is present.")
else:
    st.error(
        "Missing: "
        + ", ".join(f"`{p}`" for p in missing["Path"])
        + " — pages citing these will flag them too."
    )

st.divider()
st.caption(
    "Going deeper: `NOTEBOOK.md` at the repository root holds the full method "
    "write-up — every threshold, the reasoning behind it and how it fails. "
    "`CODEMAP.md` maps the code file by file; page 15 renders it."
)
st.caption(
    "Edit page text in `logbook_content.py`; the sidebar groups are `NAV` at the "
    "bottom of that file. Layout helpers are in `scripts/ui_utils.py`. Pages under "
    "`pages/` are intentionally thin."
)
