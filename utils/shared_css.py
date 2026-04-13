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

import base64
from pathlib import Path

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
/* ── Google Fonts import ── */
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

/* ── Global accent colour (overrides Streamlit default blue) ── */
:root, .stApp, .stApp[data-theme="light"] {
    --primary-color: #33A9A0 !important;
    --ppg-teal: #33A9A0;
    --ppg-navy: #33528A;
    --ppg-lime: #C4E81D;
    --ppg-green: #8AB62E;
    --ppg-olive: #597001;
    --ppg-dark: #0f172a;
    --ppg-surface: #ffffff;
    --ppg-bg: #f8fafc;
    --ppg-border: #e2e8f0;
    --ppg-muted: #64748b;
    --ppg-radius: 16px;
}

/* ── Global typography ── */
html, body, .stApp, .stMarkdown, p, span, div, label,
.stButton > button, .stSelectbox, .stMultiSelect,
.stTextInput, .stRadio, .stCheckbox {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
}

/* ── Subtle page background ── */
.stApp {
    background: var(--ppg-bg) !important;
}

/* ── Multiselect tag chips ── */
[data-baseweb="tag"] {
    background-color: rgba(51,169,160,0.12) !important;
    border: 1px solid rgba(51,169,160,0.25) !important;
    border-radius: 8px !important;
}
[data-baseweb="tag"] > span:first-child {
    color: #0f172a !important;
    font-weight: 500 !important;
}

/* ── Project colour-palette button overrides ── */
.stButton > button {
    font-family: 'Inter', sans-serif !important;
    font-weight: 600;
    font-size: 0.84rem;
    letter-spacing: 0.01em;
    padding: 0 26px;
    height: 42px;
    min-width: 48px;
    border-radius: 12px;
    border: 1px solid var(--ppg-border);
    background-color: var(--ppg-surface);
    color: var(--ppg-dark) !important;
    box-shadow: 0 1px 3px rgba(0,0,0,0.04);
    transition: all 0.18s ease;
    cursor: pointer;
}
.stButton > button:hover {
    background-color: #f1f5f9;
    border-color: #cbd5e1;
    box-shadow: 0 2px 8px rgba(0,0,0,0.06);
    transform: translateY(-1px);
}
.stButton > button:active {
    transform: translateY(0);
    box-shadow: 0 1px 2px rgba(0,0,0,0.06);
}

/* Primary button → lime-green accent */
.stButton > button[kind="primary"] {
    background: linear-gradient(135deg, #C4E81D 0%, #a8d110 100%) !important;
    color: #3d5200 !important;
    border: none !important;
    font-weight: 700 !important;
    box-shadow: 0 2px 12px rgba(196,232,29,0.3) !important;
}
.stButton > button[kind="primary"]:hover {
    background: linear-gradient(135deg, #b5d618 0%, #8AB62E 100%) !important;
    color: #FFFFFF !important;
    box-shadow: 0 4px 20px rgba(138,182,46,0.35) !important;
    transform: translateY(-1px);
}

/* ── "Using recommended source" black badge ── */
.source-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: var(--ppg-dark);
    color: #FFFFFF;
    font-size: 0.8rem;
    font-weight: 600;
    padding: 5px 16px;
    border-radius: 10px;
    margin-top: 2px;
    letter-spacing: 0.01em;
}

/* ── Persistent step indicator bar ── */
.step-indicator {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0;
    padding: 0.5rem 1.5rem 0.9rem 1.5rem;
    margin: 0 auto 0.5rem auto;
    max-width: 720px;
    background: var(--ppg-surface);
    border-radius: 16px;
    border: 1px solid var(--ppg-border);
    box-shadow: 0 1px 4px rgba(0,0,0,0.04);
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
    width: 32px;
    height: 32px;
    border-radius: 50%;
    font-size: 0.76rem;
    font-weight: 700;
    flex-shrink: 0;
    transition: all 0.25s ease;
    border: 2px solid transparent;
}
.step-circle.active {
    background: var(--ppg-lime);
    color: var(--ppg-dark);
    border-color: rgba(196,232,29,0.5);
    box-shadow: 0 0 0 4px rgba(196,232,29,0.18), 0 2px 8px rgba(196,232,29,0.25);
}
.step-circle.done {
    background: var(--ppg-teal);
    color: #FFFFFF;
    border-color: rgba(51,169,160,0.3);
}
.step-circle.upcoming {
    background: #f1f5f9;
    color: #94a3b8;
    border-color: #e2e8f0;
}
.step-label {
    font-size: 0.68rem;
    font-weight: 600;
    margin-top: 3px;
    white-space: nowrap;
    text-align: center;
    letter-spacing: 0.01em;
}
.step-label.active  { color: var(--ppg-dark); font-weight: 700; }
.step-label.done    { color: var(--ppg-teal); }
.step-label.upcoming{ color: #94a3b8; }
.step-connector {
    width: 40px;
    height: 2px;
    margin: 0 3px;
    flex-shrink: 0;
    border-radius: 1px;
}
.step-connector.done     { background: linear-gradient(90deg, var(--ppg-teal), rgba(51,169,160,0.4)); }
.step-connector.upcoming { background: #e2e8f0; }

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
    border-radius: var(--ppg-radius);
    padding: 0.85rem 1.1rem;
    text-align: center;
    box-shadow: 0 1px 6px rgba(0,0,0,0.04);
    backdrop-filter: blur(8px);
}
.sb-val {
    font-size: 1.35rem;
    font-weight: 700;
    margin-bottom: 0.1rem;
}
.sb-lbl {
    font-size: 0.76rem;
    font-weight: 600;
    color: var(--ppg-muted);
    letter-spacing: 0.02em;
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
    border-radius: var(--ppg-radius);
    padding: 0.9rem 1.1rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 80px;
    box-shadow: 0 1px 6px rgba(0,0,0,0.04);
}
.sticky-sidebar .pg-card .pg-val {
    font-size: 1.8rem;
    font-weight: 700;
    margin-bottom: 0.15rem;
}
.sticky-sidebar .pg-card .pg-lbl {
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--ppg-muted);
}

/* ── Enhanced expanders ── */
div[data-testid="stExpander"] {
    background: var(--ppg-surface);
    border: 1px solid var(--ppg-border);
    border-radius: 14px !important;
    overflow: hidden;
    box-shadow: 0 1px 4px rgba(0,0,0,0.03);
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
}
div[data-testid="stExpander"]:hover {
    border-color: rgba(51,169,160,0.3);
    box-shadow: 0 2px 12px rgba(51,169,160,0.06);
}

/* ── Enhanced selectbox / dropdowns ── */
div[data-baseweb="select"] > div {
    border-radius: 12px !important;
    border-color: var(--ppg-border) !important;
    background: var(--ppg-surface) !important;
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
}
div[data-baseweb="select"] > div:hover {
    border-color: var(--ppg-teal) !important;
}
div[data-baseweb="select"] > div:focus-within {
    border-color: var(--ppg-teal) !important;
    box-shadow: 0 0 0 3px rgba(51,169,160,0.12) !important;
}
div[data-baseweb="popover"] > div {
    border-radius: 14px !important;
    box-shadow: 0 8px 32px rgba(0,0,0,0.10) !important;
    border: 1px solid var(--ppg-border) !important;
}

/* ── Enhanced text inputs ── */
.stTextInput > div > div > input {
    border-radius: 12px !important;
    border: 1px solid var(--ppg-border) !important;
    padding: 0.7rem 1rem !important;
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
}
.stTextInput > div > div > input:focus {
    border-color: var(--ppg-teal) !important;
    box-shadow: 0 0 0 3px rgba(51,169,160,0.12) !important;
}

/* ── Refined alerts ── */
div[data-testid="stAlert"] {
    border-radius: 14px !important;
    border: none !important;
    font-size: 0.86rem !important;
}

/* ── Radio buttons refined ── */
div[data-testid="stRadio"] > div {
    gap: 0.4rem !important;
}
div[data-testid="stRadio"] label {
    border-radius: 10px;
    padding: 6px 14px;
    transition: background 0.15s ease;
}
div[data-testid="stRadio"] label:hover {
    background: rgba(51,169,160,0.06);
}

/* ── Metrics ── */
[data-testid="stMetric"] {
    background: var(--ppg-surface);
    border: 1px solid var(--ppg-border);
    border-radius: var(--ppg-radius);
    padding: 0.8rem 1rem;
    box-shadow: 0 1px 4px rgba(0,0,0,0.03);
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


def render_top_cards(cards: list):
    """
    Render summary cards as a horizontal row at the top of the page.

    Parameters
    ----------
    cards : list of dict
        Each dict: {"value": str, "label": str, "color": str,
                    "bg": str, "border": str}
    """
    inner = "".join(
        f"<div style='flex:1 1 0; border-radius:16px; padding:1.2rem 1.5rem; "
        f"display:flex; flex-direction:column; align-items:center; justify-content:center; "
        f"min-height:100px; box-shadow:0 1px 6px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.02); "
        f"background:{c['bg']}; border:1px solid {c['border']}; "
        f"transition: transform 0.2s ease, box-shadow 0.2s ease;'>"
        f"<div style='font-size:2rem; font-weight:800; margin-bottom:0.2rem; color:{c['color']}; "
        f"font-family:Inter,sans-serif; letter-spacing:-0.02em;'>{c['value']}</div>"
        f"<div style='font-size:0.82rem; font-weight:600; color:#64748b; letter-spacing:0.02em; "
        f"text-transform:uppercase;'>{c['label']}</div>"
        f"</div>"
        for c in cards
    )
    st.markdown(
        f"<div style='display:flex; gap:1rem; margin:1rem 0 1.5rem 0;'>{inner}</div>",
        unsafe_allow_html=True,
    )


def _load_svg_data_uri(asset_name: str) -> str | None:
    asset_path = Path(__file__).resolve().parents[1] / "assets" / asset_name
    if not asset_path.exists():
        return None
    svg_text = asset_path.read_text(encoding="utf-8")
    encoded = base64.b64encode(svg_text.encode("utf-8")).decode("utf-8")
    return f"data:image/svg+xml;base64,{encoded}"


def render_branded_top_bar(page_title: str, subtitle: str = "", home_target: str = "planning_guide.py"):
    """Render a professional branded page header with logos and a home-page link."""
    next_labs_logo = _load_svg_data_uri("chalmers_next_labs_logo_white.svg")
    university_logo = _load_svg_data_uri("chalmers_university_logo_white.svg")

    logo_html = ""
    if next_labs_logo:
        logo_html += f"<img src='{next_labs_logo}' alt='Chalmers Next Labs' style='height:44px; object-fit:contain;'>"
    if university_logo:
        if logo_html:
            logo_html += "<div style='width:1px; height:32px; background:rgba(255,255,255,0.22); margin:0 2px;'></div>"
        logo_html += f"<img src='{university_logo}' alt='Chalmers University of Technology' style='height:34px; object-fit:contain;'>"

    # Use st.html() for guaranteed rendering — st.markdown can strip img tags & complex CSS
    st.html(
        f"""
        <div style="
            background-color: #33528A;
            background: linear-gradient(135deg, #2a4778 0%, #33528A 25%, #33A9A0 65%, #5ba3b8 100%);
            border-radius: 20px;
            padding: 1.3rem 1.6rem;
            margin: 0 0 0.5rem 0;
            box-shadow: 0 4px 16px rgba(34, 64, 118, 0.12), 0 12px 40px rgba(34, 64, 118, 0.08);
            border: 1px solid rgba(255,255,255,0.15);
            overflow: hidden;
            position: relative;
            font-family: 'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif;
        ">
            <div style="position:absolute; inset:0;
                background: linear-gradient(120deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0) 40%, rgba(255,255,255,0.04) 70%, rgba(255,255,255,0) 100%);
                pointer-events:none;"></div>
            <div style="position:absolute; top:-40px; right:-40px; width:200px; height:200px;
                border-radius:50%; background:rgba(196,232,29,0.05); pointer-events:none;"></div>
            <div style="position:absolute; bottom:-30px; left:-30px; width:140px; height:140px;
                border-radius:50%; background:rgba(255,255,255,0.03); pointer-events:none;"></div>

            <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:1.25rem; position:relative; z-index:1;">
                <div>
                    <div style="font-size:0.68rem; text-transform:uppercase;
                        letter-spacing:0.18em; font-weight:700; color:rgba(255,255,255,0.65); margin-bottom:0.35rem;">
                        Project Planning Guide
                    </div>
                    <div style="font-size:1.55rem; line-height:1.15;
                        font-weight:800; color:#ffffff; letter-spacing:-0.02em;">
                        {page_title}
                    </div>
                    <div style="font-size:0.86rem; color:rgba(255,255,255,0.82);
                        margin-top:0.4rem; max-width:58ch; line-height:1.45;">
                        {subtitle}
                    </div>
                </div>
                <div style="display:flex; align-items:center; gap:0.85rem; flex-shrink:0; opacity:0.92;">{logo_html}</div>
            </div>
            <div style="display:flex; align-items:center; justify-content:space-between; gap:0.75rem; margin-top:1rem; position:relative; z-index:1;">
                <div style="display:inline-flex; align-items:center; gap:0.4rem;
                    background:rgba(196,232,29,0.14); border:1px solid rgba(196,232,29,0.3);
                    color:rgba(246,255,209,0.9); padding:0.3rem 0.85rem; border-radius:999px;
                    font-size:0.72rem; font-weight:600; letter-spacing:0.02em;
                    backdrop-filter:blur(4px);">
                    <span style="font-size:0.6rem;">&#9670;</span> Workflow Navigation
                </div>
                <div style="font-size:0.72rem; color:rgba(255,255,255,0.55); letter-spacing:0.02em;">
                    Chalmers University of Technology &times; Chalmers Next Labs
                </div>
            </div>
        </div>
        """
    )
    st.page_link(home_target, label="Home Page")
