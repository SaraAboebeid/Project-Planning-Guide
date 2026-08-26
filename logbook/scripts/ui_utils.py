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

import io
import subprocess
import zipfile
from pathlib import Path

import pandas as pd
import streamlit as st

# logbook/scripts/ui_utils.py -> logbook/ -> repo root
LOGBOOK_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = LOGBOOK_DIR.parent

STAGE_COLORS = {
    "raw":       ("#8B5CF6", "#F3EEFF"),
    "interim":   ("#E8880C", "#FFF4E5"),
    "processed": ("#2FB477", "#E8F7F0"),
    "metadata":  ("#4A90E2", "#EAF2FC"),
    "method":    ("#6E2AAE", "#F2EAFB"),
    "result":    ("#0F766E", "#E6F4F1"),
}


# ── styling ──────────────────────────────────────────────────────────────────

def inject_css() -> None:
    st.markdown(
        """
        <style>
          .lb-badge { display:inline-block; padding:0.15rem 0.6rem; border-radius:999px;
                      font-size:0.72rem; font-weight:600; letter-spacing:0.03em;
                      text-transform:uppercase; }
          .lb-card  { background:#f5f6f7; border:1px solid #e1e4e8; border-radius:10px;
                      padding:1.25rem 1.5rem; margin-top:1.2rem; }
          .lb-card h4 { margin:0 0 0.75rem 0; }
          .lb-card p  { margin:0 0 0.75rem 0; font-size:0.95rem; color:#555; }
          .lb-card ol { margin:0; padding-left:1.15rem; line-height:1.55; font-size:0.95rem; }
          .lb-purpose { font-size:1.02rem; line-height:1.6; }
          .lb-missing { color:#E2483B; font-weight:600; }
        </style>
        """,
        unsafe_allow_html=True,
    )


def badge(stage: str) -> str:
    fg, bg = STAGE_COLORS.get(stage, ("#555", "#eee"))
    return f"<span class='lb-badge' style='color:{fg};background:{bg};'>{stage}</span>"


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


def show_files(paths: list[str]) -> None:
    """Render a live file table and shout about anything missing."""
    if not paths:
        return
    df = file_status_table(paths)
    missing = df[df["Status"] == "MISSING"]["Path"].tolist()
    show_dataframe_safe(df)
    if missing:
        st.markdown(
            "<span class='lb-missing'>Not found in the repository: "
            + ", ".join(f"<code>{m}</code>" for m in missing)
            + "</span> — this page references code that no longer exists.",
            unsafe_allow_html=True,
        )


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

def page_markdown(page: dict) -> str:
    """Flatten one page's content dict to standalone markdown."""
    md = [f"# {page['number']}. {page['title']}", ""]
    if page.get("stage"):
        md += [f"*Stage: {page['stage']}*", ""]
    md += [page.get("purpose", "").strip(), ""]
    ov = page.get("overview")
    if ov:
        md += [f"## {ov['title']}", "", ov.get("subtitle", ""), ""]
        md += [f"{i}. **{lab}** — {txt}" for i, (lab, txt) in enumerate(ov["items"], 1)]
        md += [""]
    for sec in page.get("sections", []):
        md += [f"## {sec['title']}", ""]
        if sec.get("badge"):
            md += [f"*{sec['badge']}*", ""]
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
    for sec in page.get("sections", []):
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

def render_page(page: dict) -> None:
    st.set_page_config(page_title=page["title"], layout="wide")
    inject_css()

    head = f"{page['number']}. {page['title']}"
    st.title(head)
    if page.get("stage"):
        st.markdown(badge(page["stage"]), unsafe_allow_html=True)

    if page.get("purpose"):
        # Plain st.markdown, NOT an HTML wrapper: Streamlit does not parse
        # markdown inside raw HTML, so a wrapper leaks literal ** and ` into
        # the rendered page.
        st.markdown(page["purpose"])

    if page.get("overview"):
        ov = page["overview"]
        overview_card(ov["title"], ov.get("subtitle", ""), ov["items"])

    sections = page.get("sections", [])
    if sections:
        st.write("")
        expand_all = st.checkbox("Expand all sections", value=False,
                                 key=f"expand_{page['number']}")
        for sec in sections:
            label = sec["title"]
            with st.expander(label, expanded=expand_all):
                if sec.get("badge"):
                    st.markdown(badge(sec["badge"]), unsafe_allow_html=True)
                if sec.get("body"):
                    st.markdown(sec["body"])
                if sec.get("table"):
                    rows = sec["table"]
                    show_dataframe_safe(pd.DataFrame(rows[1:], columns=rows[0]))
                if sec.get("files"):
                    st.caption("Where this lives in the repository")
                    show_files(sec["files"])

    if page.get("todo"):
        st.warning("**Still to fill in:** " + page["todo"])

    st.divider()
    c1, c2 = st.columns(2)
    with c1:
        make_markdown_download(page)
    with c2:
        make_page_bundle_download(page)
