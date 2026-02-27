"""
Shared CSS styles injected into every page so buttons, colours, and typography
match the project colour palette.

Palette:
  #1A1A1A  black       – back / default buttons
  #33A9A0  teal        – primary accent
  #C4E81D  lime green  – continue buttons
  #8AB62E  green       – continue hover
  #597001  dark olive  – heading emphasis
  #33528A  navy blue   – secondary accents
"""

import streamlit as st

# ── Step metadata used by the persistent stepper ──
_STEPS = [
    ("1", "Define Scope",       "pages/1_Define_Scope_and_Context.py"),
    ("2", "Review Data",        "pages/2_Review_Data.py"),
    ("3", "Confidence",         "pages/3_Analysis_Method.py"),
    ("4", "Expected Results",   "pages/4_Expected_Results.py"),
    ("5", "Timeline",           "pages/5_Project_Timeline.py"),
    ("6", "Cost Estimation",    "pages/6_Tasks_and_Cost.py"),
]

_NAV_BUTTON_CSS = """
<style>
/* ── Global accent colour (overrides Streamlit default blue) ── */
:root, .stApp, .stApp[data-theme="light"] {
    --primary-color: #33A9A0 !important;
}

/* ── Multiselect tag chips ── */
[data-baseweb="tag"] {
    background-color: rgba(51,169,160,0.15) !important;
}
[data-baseweb="tag"] > span:first-child {
    color: #1A1A1A !important;
}

/* ── Project colour-palette button overrides ── */
.stButton > button {
    font-family: 'Roboto', sans-serif;
    font-weight: 500;
    font-size: 0.875rem;
    letter-spacing: 0.1px;
    padding: 0 24px;
    height: 40px;
    min-width: 48px;
    border-radius: 9999px;
    border: none;
    background-color: #1A1A1A;
    color: #FFFFFF !important;
    box-shadow: none;
    transition: all 0.2s cubic-bezier(0.2, 0, 0, 1);
    cursor: pointer;
}
.stButton > button:hover {
    background-color: #333333;
    box-shadow: 0 1px 2px rgba(0,0,0,.3), 0 1px 3px 1px rgba(0,0,0,.15);
}
.stButton > button:active {
    background-color: #333333;
    box-shadow: none;
}

/* Primary button → lime-green accent */
.stButton > button[kind="primary"] {
    background-color: #C4E81D !important;
    color: #597001 !important;
    border: none !important;
}
.stButton > button[kind="primary"]:hover {
    background-color: #8AB62E !important;
    color: #FFFFFF !important;
}

/* ── "Using recommended source" black badge ── */
.source-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: #1A1A1A;
    color: #FFFFFF;
    font-size: 0.82rem;
    font-weight: 500;
    padding: 4px 14px;
    border-radius: 8px;
    margin-top: 2px;
}

/* ── Persistent step indicator bar ── */
.step-indicator {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0;
    padding: 0.6rem 0 0.9rem 0;
    margin-bottom: 0.3rem;
}
.step-node {
    display: flex;
    align-items: center;
    gap: 0;
}
.step-circle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    font-size: 0.78rem;
    font-weight: 700;
    flex-shrink: 0;
    transition: all 0.2s ease;
}
.step-circle.active {
    background: #C4E81D;
    color: #1A1A1A;
    box-shadow: 0 0 0 3px rgba(196,232,29,0.35);
}
.step-circle.done {
    background: #33A9A0;
    color: #FFFFFF;
}
.step-circle.upcoming {
    background: #E5E5E5;
    color: #9CA3AF;
}
.step-label {
    font-size: 0.7rem;
    font-weight: 500;
    margin-top: 2px;
    white-space: nowrap;
    text-align: center;
}
.step-label.active  { color: #1A1A1A; font-weight: 700; }
.step-label.done    { color: #33A9A0; }
.step-label.upcoming{ color: #9CA3AF; }
.step-connector {
    width: 36px;
    height: 2px;
    margin: 0 2px;
    flex-shrink: 0;
}
.step-connector.done     { background: #33A9A0; }
.step-connector.upcoming { background: #E5E5E5; }

/* ── Fixed right sidebar for summary cards ── */
.fixed-sidebar {
    position: fixed;
    top: 120px;
    right: 1.5rem;
    width: 230px;
    z-index: 50;
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
}
.sb-card {
    border-radius: 12px;
    padding: 0.8rem 1rem;
    text-align: center;
    box-shadow: 0 1px 4px rgba(0,0,0,0.06);
}
.sb-val {
    font-size: 1.4rem;
    font-weight: 700;
    margin-bottom: 0.1rem;
}
.sb-lbl {
    font-size: 0.78rem;
    font-weight: 500;
    color: #6b7280;
}

/* ── Sticky column sidebar (used with st.columns) ── */
[data-testid="stHorizontalBlock"]:has(.sticky-sidebar) [data-testid="stVerticalBlockBorderWrapper"] {
    position: sticky;
    top: 3.5rem;
    align-self: flex-start;
}
.sticky-sidebar .pg-card-stack {
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
    margin-bottom: 1rem;
}
.sticky-sidebar .pg-card {
    border-radius: 14px;
    padding: 0.9rem 1.1rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 80px;
    box-shadow: 0 1px 4px rgba(0,0,0,0.06);
}
.sticky-sidebar .pg-card .pg-val {
    font-size: 1.8rem;
    font-weight: 700;
    margin-bottom: 0.15rem;
}
.sticky-sidebar .pg-card .pg-lbl {
    font-size: 0.82rem;
    font-weight: 500;
    color: #6b7280;
}
</style>
"""


def inject_shared_css():
    """Call once at the top of every page to apply the shared theme."""
    st.markdown(_NAV_BUTTON_CSS, unsafe_allow_html=True)


def render_step_indicator(current_step: int):
    """
    Render a compact horizontal step-progress bar.

    Parameters
    ----------
    current_step : int
        1-based index of the active step (1–6).
    """
    parts: list[str] = []
    for idx, (num, label, _page) in enumerate(_STEPS):
        step_num = idx + 1
        if step_num < current_step:
            cls = "done"
        elif step_num == current_step:
            cls = "active"
        else:
            cls = "upcoming"

        # connector before this node (skip first)
        if idx > 0:
            conn_cls = "done" if step_num <= current_step else "upcoming"
            parts.append(f"<div class='step-connector {conn_cls}'></div>")

        check = "✓" if cls == "done" else num
        parts.append(
            f"<div style='display:flex;flex-direction:column;align-items:center;'>"
            f"<div class='step-circle {cls}'>{check}</div>"
            f"<div class='step-label {cls}'>{label}</div>"
            f"</div>"
        )

    st.markdown(
        f"<div class='step-indicator'>{''.join(parts)}</div>",
        unsafe_allow_html=True,
    )


def recommended_source_badge():
    """Render a black 'Using recommended source' badge (replaces st.success)."""
    st.markdown(
        "<div class='source-badge'>✔ Using recommended source</div>",
        unsafe_allow_html=True,
    )


def render_sidebar_cards(cards: list):
    """
    Render summary cards as a fixed right-side panel.

    Parameters
    ----------
    cards : list of dict
        Each dict: {"value": str, "label": str, "color": str,
                    "bg": str, "border": str}
    """
    st.markdown(
        "<style>[data-testid='stMainBlockContainer']"
        "{max-width:calc(100% - 270px)!important;}</style>",
        unsafe_allow_html=True,
    )
    inner = "".join(
        f"<div class='sb-card' style='background:{c['bg']};border:1px solid {c['border']};'>"
        f"<div class='sb-val' style='color:{c['color']};'>{c['value']}</div>"
        f"<div class='sb-lbl'>{c['label']}</div>"
        f"</div>"
        for c in cards
    )
    st.markdown(f"<div class='fixed-sidebar'>{inner}</div>", unsafe_allow_html=True)
