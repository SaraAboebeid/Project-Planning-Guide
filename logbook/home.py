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

# The landing hero borrows the renovation planner's arrival screen: a small
# uppercase eyebrow, the name at full weight, then the one-line explanation.
st.markdown(
    """
    <div class="lb-landing">
      <div class="lb-eyebrow" style="letter-spacing:0.22em;">Project Planning Guide</div>
      <h1 class="lb-landing-title">Logbook</h1>
      <p class="lb-landing-sub">
        A stage-by-stage record of how this decision-support tool is built: the data
        it ingests, how that data is processed, how buildings are simulated, and how
        renovation options are ranked and chosen. Each page exports itself as
        Markdown, so the logbook doubles as a source for reports and appendices.
      </p>
      <div class="lb-landing-note">
        <span>🧭</span>
        <span>A continuation of <strong>DT4PED — Digital Twin for Positive Energy
        Districts</strong>, upscaling that approach from a single district to national
        and European level. See <strong>17. Project Team &amp; Credits</strong>.</span>
      </div>
    </div>
    <style>
      /* Colours come from the --lb-* variables inject_css() sets for the mode
         in use, so the hero follows bright and dark without a second copy. */
      .lb-landing { padding:2.1rem 2.3rem; margin-bottom:1.6rem; border-radius:18px;
        background:radial-gradient(circle at 12% 0%, rgba(var(--lb-brand-rgb),0.28) 0%,
                   rgba(var(--lb-brand-rgb),0) 58%), var(--lb-card);
        border:1px solid var(--lb-card-border); box-shadow:var(--lb-shadow); }
      .lb-landing-title { font-size:3rem; font-weight:900; letter-spacing:-0.035em;
        line-height:1.05; margin:0.1rem 0 0.7rem 0;
        background:linear-gradient(95deg, var(--lb-heading) 0%,
                   var(--lb-accent) 55%, var(--lb-teal) 100%);
        -webkit-background-clip:text; background-clip:text; color:transparent; }
      .lb-landing-sub { max-width:63ch; font-size:1rem; line-height:1.7;
        color:var(--lb-txt); margin:0 0 1.2rem 0; }
      .lb-landing-note { display:flex; gap:0.7rem; align-items:flex-start;
        max-width:70ch; font-size:0.88rem; line-height:1.6;
        color:var(--lb-txt); padding:0.75rem 0.95rem; border-radius:11px;
        background:var(--lb-hover); border:1px solid var(--lb-teal); }
    </style>
    """,
    unsafe_allow_html=True,
)

# ── contents, grouped exactly like the sidebar ───────────────────────────────
st.markdown(
    """
    <style>
      .lb-group { font-size:0.7rem; font-weight:800; letter-spacing:0.18em;
        text-transform:uppercase; color:var(--lb-accent); margin:1.4rem 0 0.2rem 0;
        display:flex; align-items:center; gap:0.8rem; }
      .lb-group::after { content:""; flex:1; height:1px;
        background:linear-gradient(90deg, var(--lb-card-border), transparent); }
      /* The card is a link: the whole tile navigates, as the planner's step
         rail does. Hover lifts the border to teal — the selected-state colour
         used across the tool.
         Everything inside is a <span>: Streamlit wraps markdown in <p>, and a
         block-level child inside that <p> makes the browser close the <a>
         early, which split each tile into four separate boxes. */
      a.lb-tile { display:block; height:100%; text-decoration:none;
        background:var(--lb-card); border:1px solid var(--lb-card-border);
        border-radius:14px; padding:0.95rem 1.05rem; box-shadow:var(--lb-shadow);
        transition:border-color 0.15s, background 0.15s, transform 0.15s; }
      a.lb-tile:hover { border-color:var(--lb-teal); background:var(--lb-hover);
        transform:translateY(-2px); text-decoration:none; }
      .lb-tile-num { font-size:0.68rem; font-weight:800; color:var(--lb-dim);
        letter-spacing:0.08em; }
      .lb-tile-title { display:block; font-size:0.93rem; font-weight:800;
        color:var(--lb-heading); line-height:1.3; margin:0.45rem 0 0.4rem 0; }
      a.lb-tile:hover .lb-tile-title { color:var(--lb-teal); }
      .lb-tile-desc { display:block; font-size:0.79rem; line-height:1.5;
        color:var(--lb-dim); }
      .lb-tile-tabs { display:block; font-size:0.7rem; font-weight:700;
        color:var(--lb-teal); margin-top:0.5rem; letter-spacing:0.03em; }
      /* Streamlit columns size to their own content, so a row came out ragged —
         a card with no tab line sat shorter than its neighbours. Every level
         between the column and the <a> has to carry the height or it stops
         there; the wrapper Streamlit centres its child in also needs
         stretching. Scoped with :has so only tile columns are touched. */
      [data-testid="stColumn"]:has(a.lb-tile) [data-testid="stVerticalBlock"],
      [data-testid="stColumn"]:has(a.lb-tile) [data-testid="stElementContainer"],
      [data-testid="stColumn"]:has(a.lb-tile) [data-testid="stMarkdown"],
      [data-testid="stColumn"]:has(a.lb-tile) [data-testid="stMarkdown"] > div,
      [data-testid="stColumn"]:has(a.lb-tile) [data-testid="stMarkdownContainer"] {
        height:100%; }
      [data-testid="stColumn"]:has(a.lb-tile) [data-testid="stMarkdown"] > div {
        align-items:stretch; }
      [data-testid="stColumn"]:has(a.lb-tile) [data-testid="stMarkdownContainer"] > p {
        height:100%; margin:0; }
    </style>
    """,
    unsafe_allow_html=True,
)
st.subheader("Contents")
st.caption(
    "Sweden and the United Kingdom are built by separate chains from different "
    "sources, so the three topics where they differ — data sources, coverage "
    "and pipelines — have a Sweden tab and a United Kingdom tab. Everything else "
    "applies to both."
)

CARDS_PER_ROW = 4
for group, keys in NAV:
    st.markdown(f"<div class='lb-group'>{group}</div>", unsafe_allow_html=True)
    for start in range(0, len(keys), CARDS_PER_ROW):
        row = keys[start:start + CARDS_PER_ROW]
        cols = st.columns(CARDS_PER_ROW)
        for col, key in zip(cols, row):
            page = PAGES[key]
            # Strip markdown before truncating, or a cut mid-token leaves a
            # stray backtick or asterisk visible in the card. Backticks and
            # asterisks only — underscores are literal here (data_pipeline.py).
            plain = re.sub(r"[`*]", "", " ".join(page["purpose"].split()))
            tabs = (f"<span class='lb-tile-tabs'>"
                    + " · ".join(label for label, _ in page["tabs"]) + "</span>"
                    ) if page.get("tabs") else ""
            # Tool.py gives every page url_path = key with underscores as dashes.
            href = key.replace("_", "-")
            with col:
                st.markdown(
                    f"<a class='lb-tile' href='{href}' target='_self'>"
                    f"<span class='lb-tile-num'>{page['number']:02d}</span> "
                    f"{badge(page['stage'])}"
                    f"<span class='lb-tile-title'>{page['title']}</span>"
                    f"<span class='lb-tile-desc'>{plain[:118].rstrip()}…</span>"
                    f"{tabs}</a>",
                    unsafe_allow_html=True,
                )
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
