"""Shared layout + data helpers for the Planning Guide logbook.

Every page is thin: it declares which content key it renders and calls
``render_page``. All prose lives in ``logbook_content.py`` so text can be edited
without touching Streamlit code, mirroring the DT4PED logbook's split.

The one addition over DT4PED: pages resolve file references against the real
repository at run time (``file_status_table``). A page that cites a script it
can no longer find says so in red rather than quietly describing code that was
deleted — which is exactly how the old Streamlit docs in this repo went stale.
"""
from __future__ import annotations

import html
import io
import re
import subprocess
import zipfile
from datetime import datetime
from pathlib import Path
from urllib.parse import quote

import pandas as pd
import streamlit as st

# logbook/scripts/ui_utils.py -> logbook/ -> repo root
LOGBOOK_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = LOGBOOK_DIR.parent

# ── the palette ──────────────────────────────────────────────────────────────
# One identity for the whole product: these are the renovation planner's own
# tokens (frontend/src/config/colors.ts and the CSS variables in
# frontend/src/index.css), not a second palette invented for the logbook.
#
# Two modes, as the planner has: dark, and the planner's "bright". The planner
# produces bright by inverting its dark theme with a CSS filter; that trick does
# not survive Streamlit's own chrome (dataframes are drawn by Streamlit, not by
# us), so bright is written out as a real palette here. It targets the same
# result: page #f6f8fc, white cards, the brand purple unchanged.
#
# The hues differ between modes ON PURPOSE. #4ECDC4 and #2FB477 are legible on
# near-black and far too pale for text on white, so bright uses deepened
# versions of the same hues.
#
# RULE inherited from the planner: colour is never the only signal. Every badge
# and chip below also carries its word, so the meaning survives for a reader who
# cannot separate the hues.

BRAND      = "#721CB8"   # --brand, the primary purple — the same in both modes
BRAND_DEEP = "#5A1790"   # --brand-deep
BRAND_DARK = "#421869"   # --brand-dark

THEMES = {
    "dark": {
        "page":        "#0a0d14",   # WizardLayout's shell
        "panel":       "#0d1117",   # top bar, cards, tooltips
        "pop":         "#11161d",   # dropdowns
        "sidebar":     "#080b11",
        "card_bg":     "rgba(13,17,23,0.80)",
        "card_border": "rgba(114,28,184,0.45)",
        "line":        "rgba(255,255,255,0.08)",
        "txt":         "rgba(255,255,255,0.88)",
        "dim":         "rgba(255,255,255,0.45)",
        "heading":     "#ffffff",
        "accent":      "#B98BE8",   # light-purple: eyebrows, links, code
        "teal":        "#4ECDC4",   # selected / active
        "good":        "#2FB477",
        "bad":         "#E2483B",
        "warn":        "#E8880C",
        "info":        "#4A90E2",
        "cyan":        "#22B8CF",
        "chip_bg":     0.15,        # tint alpha behind a badge
        "chip_border": 0.45,
        "hover_bg":    "rgba(78,205,196,0.07)",
        "shadow":      "none",
        # The page-number chip sits on a 25% purple tint: white reads on it over
        # near-black, but the purple itself would not.
        "num_fg":      "#ffffff",
        "btn_fg":      "#ffffff",
    },
    "light": {
        "page":        "#f6f8fc",   # body.bright-mode background
        "panel":       "#ffffff",
        "pop":         "#ffffff",
        "sidebar":     "#f1f2f8",
        "card_bg":     "#ffffff",
        "card_border": "rgba(114,28,184,0.28)",
        "line":        "#e2e8f0",
        "txt":         "#1e293b",
        "dim":         "#64748b",
        "heading":     "#0f172a",
        "accent":      "#6D28D9",   # #B98BE8 is unreadable on white
        "teal":        "#0F8B84",
        "good":        "#15803D",
        "bad":         "#B91C1C",
        "warn":        "#B45309",
        "info":        "#1D4ED8",
        "cyan":        "#0E7490",
        "chip_bg":     0.12,
        "chip_border": 0.35,
        "hover_bg":    "rgba(15,139,132,0.08)",
        "shadow":      "0 1px 2px rgba(15,23,42,0.05), 0 4px 14px rgba(66,24,105,0.06)",
        # …and over white it is the other way round: the purple reads, white does not.
        "num_fg":      BRAND,
        "btn_fg":      "#ffffff",
    },
}


def theme_mode() -> str:
    """"light" or "dark" — whichever Streamlit is currently rendering.

    st.context.theme follows the reader's choice in ⋮ → Settings → Appearance
    (including "System"), and changing it reruns the script, so the stylesheet
    below is rebuilt for the new mode. Older Streamlit builds have no
    st.context.theme; those fall back to dark, which is what config.toml's
    `base` makes the default anyway.
    """
    try:
        return "light" if st.context.theme.type == "light" else "dark"
    except Exception:
        return "dark"


def theme() -> dict:
    return THEMES[theme_mode()]


def tint(hex_color: str, alpha: float) -> str:
    """rgba() tint of a hex token — the planner's `tint()` helper, in Python."""
    h = hex_color.lstrip("#")
    r, g, b = (int(h[i:i + 2], 16) for i in (0, 2, 4))
    return f"rgba({r},{g},{b},{alpha})"


def stage_colors() -> dict:
    """One hue per stage, for the mode in use; the chip is drawn as a tint of
    it, the way the planner draws its status chips."""
    t = theme()
    return {
        "raw":       t["accent"],
        "interim":   t["warn"],
        "processed": t["good"],
        "metadata":  t["info"],
        "method":    t["accent"],
        "result":    t["teal"],
        # dataset stages on Data Sources: a lookup table (TABULA, Wikells, …) is
        # neither raw observation nor our processing, and made-up numbers must
        # never be mistaken for data
        "reference": t["cyan"],
        "synthetic": t["bad"],
    }


# ── styling ──────────────────────────────────────────────────────────────────

def _css(t: dict) -> str:
    """The stylesheet for one mode. Everything below reads the CSS variables in
    :root, so a colour is stated once, here, and never twice in a rule."""
    return f"""
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');

:root {{
  --lb-page:{t["page"]}; --lb-panel:{t["panel"]}; --lb-pop:{t["pop"]};
  --lb-sidebar:{t["sidebar"]};
  --lb-card:{t["card_bg"]}; --lb-card-border:{t["card_border"]};
  --lb-shadow:{t["shadow"]}; --lb-hover:{t["hover_bg"]};
  --lb-brand:{BRAND}; --lb-brand-rgb:114,28,184;
  --lb-brand-deep:{BRAND_DEEP}; --lb-brand-dark:{BRAND_DARK};
  --lb-accent:{t["accent"]};
  --lb-teal:{t["teal"]}; --lb-good:{t["good"]}; --lb-bad:{t["bad"]};
  --lb-warn:{t["warn"]}; --lb-info:{t["info"]};
  --lb-txt:{t["txt"]}; --lb-dim:{t["dim"]}; --lb-heading:{t["heading"]};
  --lb-line:{t["line"]};
  --lb-num-fg:{t["num_fg"]}; --lb-btn-fg:{t["btn_fg"]};
}}

/* ── type ──────────────────────────────────────────────────────────────── */
/* Inter on the app, by inheritance. NOT on every emotion class: Streamlit's
   expander arrows are Material Symbols ligatures, and forcing Inter on them
   printed the literal text "arrow_right" over each section title. */
html, body, .stApp {{
  font-family:'Inter', ui-sans-serif, system-ui, sans-serif;
}}
/* Belt and braces — any icon keeps its own font whatever else is set. */
[data-testid="stIconMaterial"], .material-icons, .material-symbols-rounded,
[class*="material-symbols"], [class*="material-icons"] {{
  font-family:'Material Symbols Rounded', 'Material Icons' !important;
}}
.stApp {{ background:var(--lb-page); }}
[data-testid="stHeader"] {{ background:transparent; }}

/* Headings run big and heavy, as they do on the planner's steps. */
.stApp h1 {{ font-weight:900; letter-spacing:-0.02em; color:var(--lb-heading); }}
.stApp h2 {{ font-weight:800; letter-spacing:-0.01em; color:var(--lb-heading);
             margin-top:1.6rem; }}
.stApp h3, .stApp h4 {{ font-weight:700; color:var(--lb-heading); }}
.stApp p, .stApp li {{ color:var(--lb-txt); line-height:1.65; }}
.stApp strong {{ color:var(--lb-heading); font-weight:700; }}
.stApp a {{ color:var(--lb-accent); text-decoration:none; }}
.stApp a:hover {{ color:var(--lb-teal); text-decoration:underline; }}
[data-testid="stCaptionContainer"], .stCaption {{ color:var(--lb-dim) !important; }}

/* ── page header: eyebrow + title + brand rule ─────────────────────────── */
.lb-hero {{ margin:0 0 1.4rem 0; }}
.lb-eyebrow {{ font-size:0.68rem; font-weight:800; letter-spacing:0.18em;
               text-transform:uppercase; color:var(--lb-accent);
               display:flex; align-items:center; gap:0.55rem; margin-bottom:0.45rem; }}
.lb-eyebrow .lb-num {{ display:inline-flex; align-items:center; justify-content:center;
               width:22px; height:22px; border-radius:50%; font-size:0.66rem;
               background:rgba(var(--lb-brand-rgb),0.25);
               border:1px solid rgba(var(--lb-brand-rgb),0.55); color:var(--lb-num-fg);
               letter-spacing:0; }}
.lb-title {{ font-size:2.1rem; font-weight:900; letter-spacing:-0.025em;
             color:var(--lb-heading); line-height:1.15; margin:0 0 0.5rem 0; }}
.lb-rule {{ height:3px; width:88px; border-radius:2px;
            background:linear-gradient(90deg, var(--lb-brand) 0%, var(--lb-teal) 100%); }}

/* ── chips and badges ──────────────────────────────────────────────────── */
.lb-badge {{ display:inline-block; padding:0.16rem 0.62rem; border-radius:999px;
             font-size:0.68rem; font-weight:800; letter-spacing:0.09em;
             text-transform:uppercase; }}
.lb-chip {{ display:inline-block; padding:0.1rem 0.6rem; border-radius:999px;
            font-size:0.72rem; font-weight:700; margin-right:5px; }}
.lb-dim {{ color:var(--lb-dim); font-size:0.82rem; }}
.lb-missing {{ color:var(--lb-bad); font-weight:700; }}

/* ── the overview card ─────────────────────────────────────────────────── */
.lb-card {{ background:linear-gradient(135deg, rgba(var(--lb-brand-rgb),0.14) 0%,
                                        var(--lb-card) 55%);
            border:1px solid var(--lb-card-border); border-radius:14px;
            box-shadow:var(--lb-shadow);
            padding:1.3rem 1.55rem; margin-top:1.2rem; }}
.lb-card h4 {{ margin:0 0 0.6rem 0; font-size:1.05rem; font-weight:800;
               color:var(--lb-heading); }}
.lb-card p  {{ margin:0 0 0.9rem 0; font-size:0.92rem; color:var(--lb-dim); }}
.lb-card ol {{ margin:0; padding-left:1.25rem; line-height:1.6; font-size:0.93rem;
               color:var(--lb-txt); }}
.lb-card ol li::marker {{ color:var(--lb-accent); font-weight:800; }}
.lb-card strong {{ color:var(--lb-heading); }}
.lb-purpose {{ font-size:1.02rem; line-height:1.65; }}

/* ── dataset card (Data Sources) ───────────────────────────────────────── */
.lb-ds {{ width:100%; border-collapse:collapse; margin:0.4rem 0 0.9rem 0;
          font-size:0.9rem; line-height:1.55; }}
.lb-ds th {{ width:205px; text-align:left; vertical-align:top; font-weight:700;
             font-size:0.72rem; letter-spacing:0.06em; text-transform:uppercase;
             color:var(--lb-accent); padding:9px 12px 9px 0;
             border-bottom:1px solid var(--lb-line); }}
.lb-ds td {{ vertical-align:top; padding:9px 0; border-bottom:1px solid var(--lb-line);
             color:var(--lb-txt); }}
.lb-ds ul {{ margin:0; padding-left:1.1rem; }}
.lb-ds li {{ margin:0 0 2px 0; }}
.lb-ds code {{ font-size:0.83rem; }}

/* ── code and file links ───────────────────────────────────────────────── */
.stApp code {{ background:rgba(var(--lb-brand-rgb),0.10); color:var(--lb-accent);
               border-radius:5px; padding:0.1em 0.38em; font-size:0.86em; }}
a.lb-file {{ text-decoration:none; }}
a.lb-file code {{ color:var(--lb-accent); background:rgba(var(--lb-brand-rgb),0.16);
                  border-bottom:1px dotted var(--lb-accent); }}
a.lb-file:hover code {{ background:var(--lb-hover); color:var(--lb-teal);
                        border-bottom-color:var(--lb-teal); }}

/* ── sections are cards, like the planner's panels ─────────────────────── */
[data-testid="stExpander"] {{ margin-bottom:0.65rem; }}
[data-testid="stExpander"] details {{
  background:var(--lb-card);
  border:1px solid var(--lb-card-border) !important;
  border-radius:14px !important; overflow:hidden; box-shadow:var(--lb-shadow);
}}
[data-testid="stExpander"] summary {{ font-weight:700; font-size:0.97rem;
  color:var(--lb-heading); padding:0.8rem 1.05rem; }}
[data-testid="stExpander"] summary:hover {{ color:var(--lb-teal); }}
[data-testid="stExpander"] details[open] > summary {{
  border-bottom:1px solid var(--lb-line); }}

/* ── sidebar ───────────────────────────────────────────────────────────── */
[data-testid="stSidebar"] {{ background:var(--lb-sidebar);
  border-right:1px solid var(--lb-line); }}
[data-testid="stSidebarNav"] a {{ border-radius:9px; }}
[data-testid="stSidebarNav"] a:hover {{ background:var(--lb-hover); }}
[data-testid="stSidebarNav"] a[aria-current="page"] {{
  background:var(--lb-hover);
  box-shadow:inset 3px 0 0 var(--lb-teal);
}}
[data-testid="stSidebarNav"] a[aria-current="page"] span {{
  color:var(--lb-teal) !important; font-weight:700; }}
[data-testid="stSidebar"] [data-testid="stSidebarNavSeparator"],
[data-testid="stSidebar"] hr {{ border-color:var(--lb-line); }}

/* ── tabs (Sweden / United Kingdom) ────────────────────────────────────── */
.stTabs [data-baseweb="tab-list"] {{ gap:4px; border-bottom:1px solid var(--lb-line); }}
/* The label sits in a child element, so the colour has to reach it too. */
.stTabs [data-baseweb="tab"], .stTabs [data-baseweb="tab"] p {{
  font-weight:700; font-size:0.88rem; color:var(--lb-dim); padding:0; }}
.stTabs [data-baseweb="tab"] {{ padding:0.5rem 0.95rem; }}
.stTabs [aria-selected="true"], .stTabs [aria-selected="true"] p {{
  color:var(--lb-teal) !important; }}
.stTabs [data-baseweb="tab-highlight"] {{ background:var(--lb-teal); }}
.stTabs [data-baseweb="tab"]:hover p {{ color:var(--lb-heading); }}

/* ── tables ────────────────────────────────────────────────────────────── */
.stApp table:not(.lb-ds) {{ border-collapse:collapse; font-size:0.89rem; }}
.stApp table:not(.lb-ds) th {{ background:rgba(var(--lb-brand-rgb),0.18);
  color:var(--lb-heading); font-weight:700; font-size:0.74rem; letter-spacing:0.05em;
  text-transform:uppercase; padding:8px 11px; border:1px solid var(--lb-line); }}
.stApp table:not(.lb-ds) td {{ padding:7px 11px; border:1px solid var(--lb-line);
  color:var(--lb-txt); }}
.stApp table:not(.lb-ds) tr:hover td {{ background:var(--lb-hover); }}

/* ── metrics ───────────────────────────────────────────────────────────── */
[data-testid="stMetric"] {{ background:var(--lb-card);
  border:1px solid var(--lb-card-border); border-radius:14px;
  padding:0.85rem 1rem; box-shadow:var(--lb-shadow); }}
[data-testid="stMetricLabel"] {{ font-size:0.7rem !important; font-weight:700;
  letter-spacing:0.08em; text-transform:uppercase; color:var(--lb-dim) !important; }}
[data-testid="stMetricValue"] {{ font-weight:800; color:var(--lb-heading); }}

/* ── buttons ───────────────────────────────────────────────────────────── */
/* The brand gradient is dark in both modes, so the label stays white. */
[data-testid="stDownloadButton"] button, .stButton button {{
  background:linear-gradient(135deg, var(--lb-brand-deep), var(--lb-brand-dark));
  border:1px solid rgba(var(--lb-brand-rgb),0.6); color:var(--lb-btn-fg);
  font-weight:700; font-size:0.85rem; border-radius:10px;
}}
[data-testid="stDownloadButton"] button:hover, .stButton button:hover {{
  border-color:var(--lb-teal); color:var(--lb-btn-fg);
  box-shadow:0 0 0 1px var(--lb-teal);
}}
[data-testid="stDownloadButton"] button p, .stButton button p {{
  color:var(--lb-btn-fg) !important; }}

/* ── alerts keep the planner's semantic hues ───────────────────────────── */
[data-testid="stAlert"] {{ border-radius:12px; border-width:1px; border-style:solid; }}

/* Native selects go white-on-white in dark mode unless both the control and
   its options are told otherwise — the same trap as in the planner. */
.stApp select, .stApp option {{ background:var(--lb-pop) !important;
  color:var(--lb-txt) !important; }}

/* Wide content scrolls in its own container; the page never scrolls sideways. */
.lb-scroll {{ overflow-x:auto; }}
</style>
"""


def inject_css() -> None:
    st.markdown(_css(theme()), unsafe_allow_html=True)


def badge(stage: str) -> str:
    t = theme()
    hue = stage_colors().get(stage, t["accent"])
    return (f"<span class='lb-badge' style='color:{hue};"
            f"background:{tint(hue, t['chip_bg'])};"
            f"border:1px solid {tint(hue, t['chip_border'])};'>{stage}</span>")


def page_header(number, title: str, stage: str | None = None) -> None:
    """The planner's step header, for a logbook page: a small uppercase eyebrow
    carrying the page number and stage, the title at full weight, and the brand
    rule under it."""
    hues = stage_colors()
    num = f"<span class='lb-num'>{number}</span>" if number is not None else ""
    stage_bit = (f"<span style='color:{hues.get(stage, theme()['accent'])}'>{stage}</span>"
                 if stage else "")
    sep = "<span style='opacity:0.35'>·</span>" if num and stage_bit else ""
    st.markdown(
        f"<div class='lb-hero'><div class='lb-eyebrow'>{num}{sep}{stage_bit}</div>"
        f"<div class='lb-title'>{html.escape(title)}</div>"
        f"<div class='lb-rule'></div></div>",
        unsafe_allow_html=True,
    )


def overview_card(title: str, subtitle: str, items: list[tuple[str, str]]) -> None:
    lis = "".join(f"<li><strong>{lab}</strong> — {txt}</li>" for lab, txt in items)
    st.markdown(
        f"<div class='lb-card'><h4>{title}</h4><p>{subtitle}</p><ol>{lis}</ol></div>",
        unsafe_allow_html=True,
    )


# ── repo introspection ───────────────────────────────────────────────────────

@st.cache_data(show_spinner=False)
def _git_last_commit(rel_path: str) -> str:
    """Last commit date for a path, or '' when git or the file is unavailable."""
    try:
        out = subprocess.run(
            ["git", "log", "-1", "--format=%ad", "--date=short", "--", rel_path],
            cwd=REPO_ROOT, capture_output=True, text=True, timeout=10,
        )
        return out.stdout.strip()
    except Exception:
        return ""


def _human_size(n: int) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024 or unit == "GB":
            return f"{n:.0f} {unit}" if unit == "B" else f"{n:,.1f} {unit}"
        n /= 1024.0
    return f"{n:.1f} GB"


@st.cache_data(show_spinner=False)
def file_facts(rel_path: str) -> dict:
    """Live facts about one repo-relative path."""
    p = REPO_ROOT / rel_path
    if not p.exists():
        return {"Path": rel_path, "Status": "MISSING", "Lines": "—",
                "Size": "—", "Last commit": _git_last_commit(rel_path) or "—"}
    if p.is_dir():
        files = [f for f in p.rglob("*") if f.is_file()]
        return {"Path": rel_path + "/", "Status": "ok", "Lines": f"{len(files)} files",
                "Size": _human_size(sum(f.stat().st_size for f in files)),
                "Last commit": _git_last_commit(rel_path) or "—"}
    try:
        lines = sum(1 for _ in p.open("r", encoding="utf-8", errors="replace"))
    except Exception:
        lines = 0
    return {"Path": rel_path, "Status": "ok", "Lines": f"{lines:,}",
            "Size": _human_size(p.stat().st_size),
            "Last commit": _git_last_commit(rel_path) or "—"}


def file_status_table(paths: list[str]) -> pd.DataFrame:
    return pd.DataFrame([file_facts(p) for p in paths])


# ── file viewer links ────────────────────────────────────────────────────────
# Every script or data path the logbook cites links to the File viewer page
# (file_viewer.py, url "file"), which shows the file as it is on disk now.
#
# The logbook also listens on the network address, so the viewer only opens
# files the logbook itself cites (plus anything inside a cited folder) and
# refuses secrets outright - it is not a general way to read the repository.

VIEWER_URL = "file"


def is_blocked(rel: str) -> bool:
    """Never shown, cited or not: env files, keys, VCS internals."""
    parts = rel.replace("\\", "/").lower().split("/")
    name = parts[-1]
    if any(p in (".git", "node_modules", "__pycache__", ".venv") for p in parts):
        return True
    if name.startswith(".env") and name != ".env.example":
        return True
    return name.endswith((".pem", ".key", ".pfx", ".p12")) or name.startswith(("id_rsa", "credentials"))


def _norm_rel(token: str) -> str | None:
    """A repo-relative posix path for an existing, unblocked file or folder -
    or None. Rejects anything that could escape the repository."""
    t = str(token).strip().replace("\\", "/").rstrip("/")
    if (not t or len(t) > 260 or t.startswith(("/", "http")) or ":" in t
            or ".." in t or any(c in t for c in "*<>?|\"")):
        return None
    p = (REPO_ROOT / t).resolve()
    try:
        rel = p.relative_to(REPO_ROOT.resolve()).as_posix()
    except ValueError:
        return None
    return rel if rel and p.exists() and not is_blocked(rel) else None


_CODE_SPAN = re.compile(r"`([^`\n]+)`")
_MD_LINK = re.compile(r"(\[[^\]\n]+\])\(([^)\s]+)\)")


def _looks_like_path(t: str) -> bool:
    return "/" in t or bool(re.search(r"\.[A-Za-z0-9]{1,8}$", t.strip()))


@st.cache_data(show_spinner=False, ttl=60)
def cited_paths() -> tuple[str, ...]:
    """Every repo path the logbook cites: section file lists, dataset cards,
    file-like `code spans` in the prose, and the links in CODEMAP.md (which the
    Script Browser renders)."""
    from logbook_content import PAGES  # lazy: logbook_content never imports us

    found: set[str] = set()

    def add(token: str, allow_dir: bool) -> None:
        rel = _norm_rel(token)
        if rel and (allow_dir or (REPO_ROOT / rel).is_file()):
            found.add(rel)

    prose: list[str] = []
    for page in PAGES.values():
        parts = list(page["tabs"]) if page.get("tabs") else [(None, page)]
        prose.append(page.get("purpose", ""))
        for _, part in parts:
            prose += [part.get("purpose", ""), part.get("todo", "") or ""]
            for sec in part.get("sections", []):
                for rel in sec.get("files", []):
                    add(rel, allow_dir=True)
                ds = sec.get("dataset") or {}
                for rel in list(ds.get("local", [])) + list(ds.get("processed_by", [])):
                    add(rel, allow_dir=True)
                prose.append(sec.get("body", ""))
                prose += [str(v) for v in ds.values() if isinstance(v, str)]
                prose += [str(v) for v in ds.get("used_in", [])]
    codemap = REPO_ROOT / "CODEMAP.md"
    if codemap.exists():
        text = codemap.read_text(encoding="utf-8", errors="replace")
        prose.append(text)
        for _, target in _MD_LINK.findall(text):
            if not target.startswith(("http", "#", "mailto:")):
                add(target.split("#")[0], allow_dir=True)
    # file-like code spans: files only - a bare `data` must not open a folder
    for text in prose:
        for token in _CODE_SPAN.findall(text or ""):
            if _looks_like_path(token):
                add(token, allow_dir=False)
    return tuple(sorted(found))


@st.cache_data(show_spinner=False, ttl=60)
def _cited_index() -> tuple[frozenset, tuple, dict]:
    cited = cited_paths()
    dirs = tuple(r for r in cited if (REPO_ROOT / r).is_dir())
    by_name: dict[str, list[str]] = {}
    for r in cited:
        by_name.setdefault(r.rsplit("/", 1)[-1], []).append(r)
    return frozenset(cited), dirs, by_name


def is_allowed(rel: str) -> bool:
    """The viewer opens a path only if the logbook cites it, or it lies inside
    a cited folder."""
    if not rel or is_blocked(rel):
        return False
    cited, dirs, _ = _cited_index()
    return rel in cited or any(rel.startswith(d + "/") for d in dirs)


def link_target(token: str) -> str | None:
    """Repo path a `code span` should link to, or None. A bare file name
    (`ingest_epc.py`) links when exactly one cited file has that name."""
    t = str(token).strip()
    if not _looks_like_path(t):
        return None
    rel = _norm_rel(t)
    if rel and is_allowed(rel):
        return rel
    if "/" in t.strip("/") and rel is None:
        tail = t.replace("\\", "/").strip("/")
        _, _, by_name = _cited_index()
        hits = [r for r in by_name.get(tail.rsplit("/", 1)[-1], []) if r.endswith("/" + tail)]
        return hits[0] if len(hits) == 1 else None
    _, _, by_name = _cited_index()
    hits = by_name.get(t, [])
    return hits[0] if len(hits) == 1 else None


def viewer_href(rel: str) -> str:
    return f"{VIEWER_URL}?path={quote(rel, safe='/')}"


def file_link_html(rel: str, label: str | None = None) -> str:
    """<a><code>path</code></a> into the viewer, flagged red if missing."""
    lab = html.escape(label or rel)
    target = link_target(rel)
    if target:
        return (f"<a class='lb-file' href='{viewer_href(target)}' target='_blank' "
                f"title='Open in the file viewer'><code>{lab}</code></a>")
    ok = (REPO_ROOT / rel).exists()
    return f"<code>{lab}</code>" + ("" if ok else " <span class='lb-missing'>missing</span>")


def linkify_markdown(text: str) -> str:
    """Turn file-like `code spans` into viewer links, leaving fenced code
    blocks and existing links alone."""
    if not text:
        return text
    chunks = re.split(r"(```.*?```)", text, flags=re.S)
    for i, chunk in enumerate(chunks):
        if chunk.startswith("```"):
            continue

        def sub(m: re.Match) -> str:
            # already the label of a markdown link: [`x`](...)
            if m.start() > 0 and chunk[m.start() - 1] == "[" and chunk[m.end():m.end() + 2] == "](":
                return m.group(0)
            target = link_target(m.group(1))
            return f"[`{m.group(1)}`]({viewer_href(target)})" if target else m.group(0)

        chunks[i] = _CODE_SPAN.sub(sub, chunk)
    return "".join(chunks)


def linkify_repo_links(text: str) -> str:
    """Point CODEMAP-style [label](repo/path) links at the viewer (they would
    otherwise resolve against the logbook's own URL and 404)."""
    def sub(m: re.Match) -> str:
        label, target = m.group(1), m.group(2)
        if target.startswith(("http", "#", "mailto:")):
            return m.group(0)
        rel = _norm_rel(target.split("#")[0])
        return f"{label}({viewer_href(rel)})" if rel and is_allowed(rel) else m.group(0)
    return _MD_LINK.sub(sub, linkify_markdown(text))


def show_files(paths: list[str]) -> None:
    """Render a live file table and shout about anything missing."""
    if not paths:
        return
    df = file_status_table(paths)
    missing = df[df["Status"] == "MISSING"]["Path"].tolist()
    df["Open"] = [viewer_href(t) if (t := link_target(p)) else "" for p in paths]
    show_dataframe_safe(df, column_config={
        "Open": st.column_config.LinkColumn("Open", display_text="view ↗")})
    if missing:
        st.markdown(
            "<span class='lb-missing'>Not found in the repository: "
            + ", ".join(f"<code>{m}</code>" for m in missing)
            + "</span> — this page references code that no longer exists.",
            unsafe_allow_html=True,
        )


# ── dataset cards (Data Sources) ─────────────────────────────────────────────
# A section may carry a "dataset" dict describing the DATA rather than the code:
# where it comes from, how it is connected, how fresh it is, how the tool stores
# it and where it is used. When present it replaces the repository file table
# (lines / size / last commit), which says nothing about the data itself.

def access_colors() -> dict:
    t = theme()
    return {
        "Live API":         t["info"],
        "Downloaded once":  t["accent"],
        "Fetched & cached": t["cyan"],
        "Scraped":          t["warn"],
        "Derived":          t["teal"],
        "Synthetic":        t["bad"],
    }


def _inline(text: str) -> str:
    """Escape, then honour `code`, **bold** and *italic* — HTML blocks get no
    markdown."""
    s = html.escape(str(text).strip())

    def code(m: re.Match) -> str:
        raw = html.unescape(m.group(1))
        return file_link_html(raw) if link_target(raw) else f"<code>{m.group(1)}</code>"

    s = re.sub(r"`([^`]+)`", code, s)
    s = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", s)
    return re.sub(r"\*([^*]+)\*", r"<em>\1</em>", s)


@st.cache_data(show_spinner=False, ttl=300)
def local_updated(paths: tuple[str, ...]) -> str:
    """Newest last-modified date across repo paths (a folder counts its newest
    file). Read live, so the card reports what is on disk today."""
    newest = None
    for rel in paths:
        p = REPO_ROOT / rel
        if not p.exists():
            continue
        stamps = ([f.stat().st_mtime for f in p.rglob("*") if f.is_file()]
                  if p.is_dir() else [p.stat().st_mtime])
        if stamps:
            newest = max(stamps + ([newest] if newest else []))
    return datetime.fromtimestamp(newest).strftime("%Y-%m-%d") if newest else "not on disk"


def _path_html(rel: str) -> str:
    return file_link_html(rel)


def dataset_card(ds: dict) -> None:
    rows: list[str] = []

    def row(label: str, value: str) -> None:
        rows.append(f"<tr><th>{label}</th><td>{value}</td></tr>")

    src = _inline(ds.get("publisher", "—"))
    if ds.get("link"):
        url = html.escape(ds["link"])
        src += f"<br><a href='{url}' target='_blank'>{url}</a>"
    row("Source", src)

    access = ds.get("access", "—")
    t = theme()
    hue = access_colors().get(access, t["accent"])
    how = (f"<span class='lb-chip' style='color:{hue};"
           f"background:{tint(hue, t['chip_bg'])};"
           f"border:1px solid {tint(hue, t['chip_border'])}'>{html.escape(access)}</span>")
    if ds.get("connection"):
        how += _inline(ds["connection"])
    row("How it is connected", how)
    if ds.get("format"):
        row("Format", _inline(ds["format"]))
    row("Source version / last updated",
        _inline(ds.get("source_version", "not stated by the publisher")))

    if ds.get("local"):
        ours = (f"<strong>{local_updated(tuple(ds['local']))}</strong> "
                f"<span class='lb-dim'>(read from disk now)</span>")
        if ds.get("refresh"):
            ours += "<br>" + _inline(ds["refresh"])
        row("Our copy last updated", ours)
    elif ds.get("refresh"):
        row("Our copy last updated", _inline(ds["refresh"]))

    if ds.get("stored_as"):
        row("Stored in the tool as", _inline(ds["stored_as"]))
    if ds.get("stage"):
        row("Data stage", badge(ds["stage"]) + (" " + _inline(ds["stage_note"])
                                                 if ds.get("stage_note") else ""))
    if ds.get("used_in"):
        row("Where it is used",
            "<ul>" + "".join(f"<li>{_inline(u)}</li>" for u in ds["used_in"]) + "</ul>")
    if ds.get("processed_by"):
        row("Processed by", ", ".join(_path_html(p) for p in ds["processed_by"]))

    st.markdown(f"<table class='lb-ds'>{''.join(rows)}</table>", unsafe_allow_html=True)


def dataset_summary(sections: list[dict]) -> None:
    """'At a glance' table built from the dataset cards, so it cannot drift
    from them."""
    rows = []
    for sec in sections:
        ds = sec.get("dataset")
        if not ds:
            continue
        rows.append({
            "Dataset": sec["title"],
            "Connection": ds.get("access", "—"),
            "Source version / updated": ds.get("source_short", ds.get("source_version", "—")),
            "Our copy": (local_updated(tuple(ds["local"])) if ds.get("local")
                         else ds.get("copy_short", "live")),
            "Stage": ds.get("stage", "—"),
        })
    if rows:
        st.markdown("**At a glance**")
        show_dataframe_safe(pd.DataFrame(rows))


# ── dataframes ───────────────────────────────────────────────────────────────

def sanitize_df(df: pd.DataFrame) -> pd.DataFrame:
    """Make any frame safe for Arrow: stringify mixed/object columns."""
    out = df.copy()
    for col in out.columns:
        if out[col].dtype == object:
            out[col] = out[col].astype(str)
    return out


def show_dataframe_safe(df: pd.DataFrame, **kwargs) -> None:
    """Full-width table, tolerant of Streamlit's width API change.

    ``use_container_width`` is deprecated from Streamlit 1.6x in favour of
    ``width="stretch"``; older builds only understand the former. Try the new
    spelling first and fall back, so the logbook runs on either.
    """
    safe = sanitize_df(df)
    try:
        st.dataframe(safe, width="stretch", hide_index=True, **kwargs)
        return
    except TypeError:
        pass
    except Exception as exc:  # pragma: no cover - display fallback
        st.warning(f"Could not render table ({exc}); showing raw text.")
        st.text(df.to_string())
        return
    try:
        st.dataframe(safe, use_container_width=True, hide_index=True, **kwargs)
    except Exception as exc:  # pragma: no cover - display fallback
        st.warning(f"Could not render table ({exc}); showing raw text.")
        st.text(df.to_string())


# ── export ───────────────────────────────────────────────────────────────────

def _content_parts(page: dict) -> list[tuple[str | None, dict]]:
    """(tab label, content dict) pairs. A plain page is one part with no label;
    a tabbed page ("tabs": [(label, dict), ...]) is one part per tab."""
    return list(page["tabs"]) if page.get("tabs") else [(None, page)]


def _body_markdown(part: dict, level: int) -> list[str]:
    """Purpose, overview and sections of one content dict, headings at `level`."""
    h = "#" * level
    md = [part.get("purpose", "").strip(), ""]
    ov = part.get("overview")
    if ov:
        md += [f"{h} {ov['title']}", "", ov.get("subtitle", ""), ""]
        md += [f"{i}. **{lab}** — {txt}" for i, (lab, txt) in enumerate(ov["items"], 1)]
        md += [""]
    for sec in part.get("sections", []):
        md += [f"{h} {sec['title']}", ""]
        if sec.get("badge"):
            md += [f"*{sec['badge']}*", ""]
        ds = sec.get("dataset")
        if ds:
            cells = [("Source", ds.get("publisher", "—") + (f" — {ds['link']}" if ds.get("link") else "")),
                     ("How it is connected", ds.get("access", "—") + (f" — {ds['connection']}" if ds.get("connection") else "")),
                     ("Format", ds.get("format", "")),
                     ("Source version / last updated", ds.get("source_version", "not stated by the publisher")),
                     ("Our copy last updated", local_updated(tuple(ds["local"])) if ds.get("local") else ds.get("refresh", "")),
                     ("Stored in the tool as", ds.get("stored_as", "")),
                     ("Data stage", ds.get("stage", "") + (f" — {ds['stage_note']}" if ds.get("stage_note") else "")),
                     ("Where it is used", "; ".join(ds.get("used_in", []))),
                     ("Processed by", ", ".join(f"`{p}`" for p in ds.get("processed_by", [])))]
            md += ["| | |", "|---|---|"]
            md += [f"| **{k}** | {str(v).replace('|', '/')} |" for k, v in cells if v]
            md += [""]
        md += [sec.get("body", "").strip(), ""]
        if sec.get("table"):
            hdr = sec["table"][0]
            md += ["| " + " | ".join(hdr) + " |",
                   "|" + "|".join(["---"] * len(hdr)) + "|"]
            md += ["| " + " | ".join(str(c) for c in row) + " |"
                   for row in sec["table"][1:]]
            md += [""]
        if sec.get("files"):
            md += ["**Files**", ""]
            md += [f"- `{f}`" for f in sec["files"]]
            md += [""]
    if part.get("todo"):
        md += [f"> **Still to fill in:** {part['todo']}", ""]
    return md


def page_markdown(page: dict) -> str:
    """Flatten one page's content dict to standalone markdown. A tabbed page
    exports every tab in turn, each under its own heading."""
    md = [f"# {page['number']}. {page['title']}", ""]
    if page.get("stage"):
        md += [f"*Stage: {page['stage']}*", ""]
    if page.get("tabs"):
        md += [page.get("purpose", "").strip(), ""]
        for label, part in page["tabs"]:
            md += [f"## {label}", ""]
            md += _body_markdown(part, level=3)
    else:
        md += _body_markdown(page, level=2)
    md += ["---", "", f"*Exported from the Project Planning Guide logbook — page "
                      f"{page['number']}, {page['title']}.*"]
    return "\n".join(md)


def make_markdown_download(page: dict) -> None:
    slug = page["title"].lower().replace(" ", "_").replace("/", "-")
    st.download_button(
        "Download this page as Markdown",
        data=page_markdown(page).encode("utf-8"),
        file_name=f"{page['number']:02d}_{slug}.md",
        mime="text/markdown",
    )


def make_page_bundle_download(page: dict) -> None:
    """Zip the page markdown together with every source file it cites."""
    slug = page["title"].lower().replace(" ", "_").replace("/", "-")
    buf = io.BytesIO()
    cited = []
    for _, part in _content_parts(page):
        for sec in part.get("sections", []):
            cited += sec.get("files", [])
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr(f"{page['number']:02d}_{slug}.md", page_markdown(page))
        for rel in dict.fromkeys(cited):
            src = REPO_ROOT / rel
            if src.is_file():
                try:
                    z.write(src, arcname=f"source/{rel}")
                except Exception:
                    pass
    st.download_button(
        "Download page bundle (markdown + cited source files)",
        data=buf.getvalue(),
        file_name=f"{page['number']:02d}_{slug}_bundle.zip",
        mime="application/zip",
    )


# ── the standard page ────────────────────────────────────────────────────────

def render_page(page: dict, extra=None) -> None:
    """`extra`: optional callable drawn after the overview, before the sections -
    for pages with interactive content (the Analysis Inventory gallery)."""
    st.set_page_config(page_title=page["title"], layout="wide")
    inject_css()

    page_header(page["number"], page["title"], page.get("stage"))

    if page.get("tabs"):
        # One page per topic, one tab per country: Sweden and the UK are built
        # from different sources, so their content is never interleaved.
        if page.get("purpose"):
            st.markdown(linkify_markdown(page["purpose"]))
        labels = [label for label, _ in page["tabs"]]
        for tab, (label, part) in zip(st.tabs(labels), page["tabs"]):
            with tab:
                _render_body(part, key=f"{page['number']}_{label}")
    else:
        _render_body(page, key=str(page["number"]), extra=extra)

    st.divider()
    c1, c2 = st.columns(2)
    with c1:
        make_markdown_download(page)
    with c2:
        make_page_bundle_download(page)


def _render_body(page: dict, key: str, extra=None) -> None:
    """Purpose, overview, sections and todo of one content dict — a whole plain
    page, or one tab of a tabbed page. `key` keeps widget ids unique per tab."""
    if page.get("purpose"):
        # Plain st.markdown, NOT an HTML wrapper: Streamlit does not parse
        # markdown inside raw HTML, so a wrapper leaks literal ** and ` into
        # the rendered page.
        st.markdown(linkify_markdown(page["purpose"]))

    if page.get("overview"):
        ov = page["overview"]
        overview_card(ov["title"], ov.get("subtitle", ""), ov["items"])

    if extra is not None:
        extra()

    sections = page.get("sections", [])
    if any(sec.get("dataset") for sec in sections):
        st.write("")
        dataset_summary(sections)
    if sections:
        st.write("")
        expand_all = st.checkbox("Expand all sections", value=False,
                                 key=f"expand_{key}")
        for sec in sections:
            label = sec["title"]
            with st.expander(label, expanded=expand_all):
                if sec.get("badge") and not sec.get("dataset"):
                    st.markdown(badge(sec["badge"]), unsafe_allow_html=True)
                if sec.get("dataset"):
                    dataset_card(sec["dataset"])
                if sec.get("body"):
                    st.markdown(linkify_markdown(sec["body"]))
                if sec.get("table"):
                    rows = sec["table"]
                    show_dataframe_safe(pd.DataFrame(rows[1:], columns=rows[0]))
                # Scripts and data are named as links into the File viewer. The
                # repository statistics table (lines / size / last commit) says
                # nothing about the data or the method, so it is off by default;
                # a page can still ask for it with "code_refs": "table".
                if sec.get("files") and not sec.get("dataset"):
                    if page.get("code_refs", "inline") == "inline":
                        st.markdown(
                            "<span class='lb-dim'>Scripts and data:</span> "
                            + " · ".join(_path_html(p) for p in sec["files"]),
                            unsafe_allow_html=True)
                    else:
                        st.caption("Where this lives in the repository")
                        show_files(sec["files"])

    if page.get("todo"):
        st.warning("**Still to fill in:** " + page["todo"])
