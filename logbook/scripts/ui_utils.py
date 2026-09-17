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

STAGE_COLORS = {
    "raw":       ("#8B5CF6", "#F3EEFF"),
    "interim":   ("#E8880C", "#FFF4E5"),
    "processed": ("#2FB477", "#E8F7F0"),
    "metadata":  ("#4A90E2", "#EAF2FC"),
    "method":    ("#6E2AAE", "#F2EAFB"),
    "result":    ("#0F766E", "#E6F4F1"),
    # dataset stages on Data Sources: a lookup table (TABULA, Wikells, …) is
    # neither raw observation nor our processing, and made-up numbers must
    # never be mistaken for data
    "reference": ("#0E7490", "#E0F2F7"),
    "synthetic": ("#B91C1C", "#FEE2E2"),
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
          /* dataset card (Data Sources) */
          .lb-ds { width:100%; border-collapse:collapse; margin:0.4rem 0 0.9rem 0;
                   font-size:0.92rem; line-height:1.5; }
          .lb-ds th { width:205px; text-align:left; vertical-align:top; font-weight:600;
                      color:#475569; padding:7px 12px 7px 0; border-bottom:1px solid #eef0f3; }
          .lb-ds td { vertical-align:top; padding:7px 0; border-bottom:1px solid #eef0f3;
                      color:#0f172a; }
          .lb-ds ul { margin:0; padding-left:1.1rem; }
          .lb-ds li { margin:0 0 2px 0; }
          .lb-ds code { font-size:0.84rem; }
          .lb-chip { display:inline-block; padding:0.08rem 0.55rem; border-radius:999px;
                     font-size:0.76rem; font-weight:700; margin-right:4px; }
          .lb-dim { color:#94a3b8; font-size:0.82rem; }
          /* links into the file viewer */
          a.lb-file { text-decoration:none; }
          a.lb-file code { color:#6D28D9; border-bottom:1px dotted #a78bfa; }
          a.lb-file:hover code { background:#F2EAFB; }
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

ACCESS_COLORS = {
    "Live API":        ("#1D4ED8", "#E0EAFF"),
    "Downloaded once": ("#6E2AAE", "#F2EAFB"),
    "Fetched & cached": ("#0E7490", "#E0F2F7"),
    "Scraped":         ("#B45309", "#FFF4E5"),
    "Derived":         ("#0F766E", "#E6F4F1"),
    "Synthetic":       ("#B91C1C", "#FEE2E2"),
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
    fg, bg = ACCESS_COLORS.get(access, ("#334155", "#F1F5F9"))
    how = f"<span class='lb-chip' style='color:{fg};background:{bg}'>{html.escape(access)}</span>"
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

    head = f"{page['number']}. {page['title']}"
    st.title(head)
    if page.get("stage"):
        st.markdown(badge(page["stage"]), unsafe_allow_html=True)

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
