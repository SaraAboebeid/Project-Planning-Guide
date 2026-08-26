"""Project Planning Guide — logbook entry point.

Run with ``run.bat`` (or ``streamlit run Tool.py``) from the ``logbook`` folder.
The file name is what Streamlit shows as the first sidebar entry, so this is
"Tool", not "Dashboard".

Pages live in ``pages/`` and are ordered by their numeric prefix; all prose
lives in ``logbook_content.py``.
"""
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import pandas as pd  # noqa: E402
import streamlit as st  # noqa: E402

from logbook_content import PAGES  # noqa: E402
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
    "national and European level. See **16. Project Team & Credits**.",
    icon="🧭",
)

# ── the pipeline, in order ───────────────────────────────────────────────────
st.subheader("Contents")

STAGE_GROUPS = [
    ("Data", ["data_portal", "script_browser", "provenance"]),
    # Sweden and the UK are built by separate chains — different geometry
    # source, different certificate join — so they get a page each.
    ("Pipelines", ["sweden_pipeline", "uk_pipeline", "digital_twin"]),
    ("Modelling", ["shoebox_idf", "simulation"]),
    ("Decision support", ["prioritisation", "optimisation", "decision"]),
    ("Analysis", ["facade_ml", "climate_env", "viewer_layers"]),
    ("Record", ["limitations", "project_team"]),
]

for group, keys in STAGE_GROUPS:
    st.markdown(f"**{group}**")
    cols = st.columns(len(keys))
    for col, key in zip(cols, keys):
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
    "Edit page text in `logbook_content.py`. Layout helpers are in "
    "`scripts/ui_utils.py`. Pages under `pages/` are intentionally thin."
)
