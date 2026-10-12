"""Logbook home page - shown first in the sidebar, as "Tool".

Moved out of Tool.py when the sidebar became country-grouped: Tool.py now only
builds the navigation. The contents cards below follow the same NAV groups as
the sidebar, so the two cannot disagree.
"""
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import streamlit as st  # noqa: E402

from logbook_content import NAV, PAGES  # noqa: E402
from scripts.architecture import build_svg  # noqa: E402
from scripts.ui_utils import badge, inject_css  # noqa: E402

st.set_page_config(page_title="Renovation Planner Logbook", layout="wide")
inject_css()

# The landing hero borrows the renovation planner's arrival screen: a small
# uppercase eyebrow, the name at full weight, then the one-line explanation.
st.markdown(
    """
    <div class="lb-landing">
      <div class="lb-eyebrow" style="letter-spacing:0.22em;">Renovation Planner</div>
      <h1 class="lb-landing-title">Logbook</h1>
      <p class="lb-landing-sub">
        This is the working record of how the Renovation Planner was built - the data
        it runs on, what that data does and does not know, how a building becomes a
        simulation, and how renovation options get ranked and chosen.
      </p>
      <div class="lb-links">
        <a class="lb-link" href="https://github.com/SaraAboebeid/Project-Planning-Guide"
           target="_blank" rel="noopener">
          <span class="lb-link-t">Repository</span>
          <span class="lb-link-s">github.com/SaraAboebeid/Project-Planning-Guide &mdash;
          the tool and this logbook, in one repo</span>
        </a>
        <a class="lb-link" href="https://renovation-planner.ace.chalmers.se/"
           target="_blank" rel="noopener">
          <span class="lb-link-t">Deployed tool <span class="lb-warn-dot">behind a login, and behind the repo</span></span>
          <span class="lb-link-s">renovation-planner.ace.chalmers.se &mdash; not rebuilt
          on every push, so run the repository for anything current</span>
        </a>
        <a class="lb-link" href="running" target="_self">
          <span class="lb-link-t">How to run it yourself</span>
          <span class="lb-link-s">Docker, or without it &mdash; and how to start this
          logbook on its own</span>
        </a>
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
        color:var(--lb-txt); margin:0 0 0.9rem 0; }
      /* Where to get it, where it is running, how to start it. */
      .lb-links { display:flex; flex-wrap:wrap; gap:0.6rem; margin:0; }
      a.lb-link { flex:1 1 230px; min-width:230px; text-decoration:none;
        border:1px solid var(--lb-card-border); border-radius:12px;
        padding:0.7rem 0.9rem; background:var(--lb-card);
        transition:border-color .15s, background .15s; }
      a.lb-link:hover { border-color:var(--lb-teal); background:var(--lb-hover);
        text-decoration:none; }
      .lb-link-t { display:block; font-size:0.88rem; font-weight:800;
        color:var(--lb-heading); margin-bottom:0.2rem; }
      a.lb-link:hover .lb-link-t { color:var(--lb-teal); }
      .lb-link-s { display:block; font-size:0.76rem; line-height:1.5;
        color:var(--lb-dim); }
      /* The deployed copy needs a caveat attached to its name, not hidden
         in the small print underneath. */
      .lb-warn-dot { display:inline-block; margin-left:0.35rem; font-size:0.62rem;
        font-weight:700; letter-spacing:0.05em; text-transform:uppercase;
        color:var(--lb-warn); border:1px solid var(--lb-warn);
        border-radius:999px; padding:0.05rem 0.45rem; vertical-align:middle; }
    </style>
    """,
    unsafe_allow_html=True,
)

# â”€â”€ contents, grouped exactly like the sidebar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
st.markdown(
    """
    <style>
      .lb-group { font-size:0.7rem; font-weight:800; letter-spacing:0.18em;
        text-transform:uppercase; color:var(--lb-accent); margin:1.4rem 0 0.2rem 0;
        display:flex; align-items:center; gap:0.8rem; }
      .lb-group::after { content:""; flex:1; height:1px;
        background:linear-gradient(90deg, var(--lb-card-border), transparent); }
      /* The card is a link: the whole tile navigates, as the planner's step
         rail does. Hover lifts the border to teal - the selected-state colour
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
      /* Streamlit columns size to their own content, so a row came out ragged -
         a card with no tab line sat shorter than its neighbours. Every level
         between the column and the <a> has to carry the height or it stops
         there; the wrapper Streamlit centres its child in also needs
         stretching. Scoped with :has so only tile columns are touched. */
      [data-testid="stColumn"]:has(a.lb-tile) [data-testid="stVerticalBlock"],
      [data-testid="stColumn"]:has(a.lb-tile) [data-testid="stElementContainer"],
      [data-testid="stColumn"]:has(a.lb-tile) [data-testid="stMarkdown"],
      [data-testid=" stColumn"]:has(a.lb-tile) [data-testid="stMarkdown"] > div,
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
    "sources, so the three topics where they differ - data sources, coverage "
    "and pipelines - have a Sweden tab and a United Kingdom tab. Everything else "
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
            # asterisks only - underscores are literal here (data_pipeline.py).
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

# â”€â”€ architecture â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# Inline SVG, not a picture: it follows bright and dark mode, stays searchable
# text, and is edited by changing LAYERS in scripts/architecture.py.
st.subheader("How it fits together")
st.caption(
    "The five steps across the top, then inputs on the left flowing to outputs "
    "on the right, with every external service the tool calls banded underneath "
    "- each marked with whether it needs an API key, and whether that key is "
    "free or billed. The detail behind each box is on 14. Services, Keys & "
    "Access and 13. Analysis Inventory. Scroll sideways to see it all."
)
st.markdown(
    # The diagram is wider than a narrow window: it scrolls in its own box so
    # the page never scrolls sideways.
    f"<div class='lb-scroll' style='padding-bottom:6px'>{build_svg()}</div>",
    unsafe_allow_html=True,
)
st.caption(
    "Whether a key is free or billed is this diagram's own reading of each "
    "provider's terms - the repository records only whether a key is needed."
)

st.divider()
st.caption(
    "Going deeper: `NOTEBOOK.md` at the repository root holds the full method "
    "write-up - every threshold, the reasoning behind it and how it fails. "
    "`CODEMAP.md` maps the code file by file; the Repository map page renders it."
)
st.caption(
    "Edit page text in `logbook_content.py`; the sidebar groups are `NAV` at the "
    "bottom of that file. Layout helpers are in `scripts/ui_utils.py`. Pages under "
    "`pages/` are intentionally thin."
)
