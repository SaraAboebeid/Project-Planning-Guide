"""Read-only previews of repository files for the logbook's Script Explorer.

Scripts are shown in full with syntax highlighting; data files get a preview
that fits their format - tables and sample rows of a database, the first
records of a JSON file, the header of a weather file, the header of a laser
tile. Nothing here writes to the repository: databases are opened read-only.

Only paths that ``ui_utils.is_allowed`` accepts are ever opened.
"""
from __future__ import annotations

import json
import re
import sqlite3
import struct
import subprocess
import zipfile
from datetime import date, datetime, timedelta
from pathlib import Path
from urllib.parse import quote

import pandas as pd
import streamlit as st

from scripts.ui_utils import (
    REPO_ROOT,
    _human_size,
    is_allowed,
    is_blocked,
    linkify_repo_links,
    show_dataframe_safe,
    viewer_href,
)

CODE_LANG = {
    ".py": "python", ".ts": "typescript", ".tsx": "tsx", ".js": "javascript",
    ".jsx": "jsx", ".mjs": "javascript", ".ps1": "powershell", ".bat": "batch",
    ".cmd": "batch", ".sh": "bash", ".yml": "yaml", ".yaml": "yaml",
    ".toml": "toml", ".ini": "ini", ".cfg": "ini", ".css": "css",
    ".html": "html", ".htm": "html", ".sql": "sql", ".xml": "xml",
    ".txt": "text", ".example": "bash", ".dockerfile": "docker",
}
IMAGE = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"}
SQLITE = {".db", ".sqlite", ".sqlite3", ".gpkg"}
TEXT_LIMIT = 2_000_000          # characters of source shown in full
DOWNLOAD_LIMIT = 50 * 1024**2   # offer a download up to this size
SAMPLE_ROWS = 100

EPW_COLUMNS = [
    "Year", "Month", "Day", "Hour", "Minute", "Data source",
    "Dry bulb (°C)", "Dew point (°C)", "Rel. humidity (%)", "Pressure (Pa)",
    "Extraterr. horizontal (Wh/m²)", "Extraterr. direct normal (Wh/m²)",
    "Horizontal infrared (Wh/m²)", "Global horizontal (Wh/m²)",
    "Direct normal (Wh/m²)", "Diffuse horizontal (Wh/m²)",
    "Global horiz. illuminance (lux)", "Direct normal illuminance (lux)",
    "Diffuse horiz. illuminance (lux)", "Zenith luminance (cd/m²)",
    "Wind direction (°)", "Wind speed (m/s)",
]


# ── helpers ─────────────────────────────────────────────────────────────────

def _short(v, n: int = 80) -> str:
    """One table cell: nested values and binary are summarised, not dumped."""
    if v is None:
        return ""
    if isinstance(v, (bytes, bytearray, memoryview)):
        return f"<binary, {len(bytes(v)):,} bytes>"
    if isinstance(v, list):
        return f"[list of {len(v):,}]" if len(v) > 3 or any(isinstance(x, (list, dict)) for x in v) \
            else json.dumps(v, ensure_ascii=False)[:n]
    if isinstance(v, dict):
        return f"{{{len(v)} keys}}"
    s = str(v)
    return s if len(s) <= n else s[: n - 1] + "…"


def _table(rows: list[dict]) -> pd.DataFrame:
    return pd.DataFrame([{k: _short(v) for k, v in r.items()} for r in rows])


def _mtime(p: Path) -> float:
    return p.stat().st_mtime


@st.cache_data(show_spinner=False)
def _git_info(rel: str) -> dict:
    """GitHub URL for the committed version, if the file is tracked."""
    def git(*args):
        return subprocess.run(["git", *args], cwd=REPO_ROOT, capture_output=True,
                               text=True, timeout=10)
    try:
        if git("ls-files", "--error-unmatch", rel).returncode != 0:
            return {}
        remote = git("remote", "get-url", "origin").stdout.strip()
        branch = git("rev-parse", "--abbrev-ref", "HEAD").stdout.strip()
        dirty = bool(git("status", "--porcelain", "--", rel).stdout.strip())
        m = re.search(r"github\.com[:/](.+?)(?:\.git)?$", remote)
        if not m:
            return {}
        return {"url": f"https://github.com/{m.group(1)}/blob/{quote(branch)}/{quote(rel)}",
                "dirty": dirty, "branch": branch}
    except Exception:
        return {}


# ── entry point ─────────────────────────────────────────────────────────────

def render_file(rel: str) -> None:
    if is_blocked(rel) or not is_allowed(rel):
        st.error("The viewer only opens files the logbook cites, and never "
                 "secrets such as `.env` - this path is not one of them.")
        return
    p = REPO_ROOT / rel
    if not p.exists():
        st.error(f"`{rel}` is cited by the logbook but no longer exists in the repository.")
        return

    st.subheader(rel)
    stat = p.stat()
    kind = "folder" if p.is_dir() else (p.suffix.lower().lstrip(".") or "file")
    facts = [kind]
    if p.is_file():
        facts.append(_human_size(stat.st_size))
    facts.append("modified " + datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d %H:%M"))
    st.caption(" · ".join(facts) + " - the version on disk now")

    links = [f"<a href='vscode://file/{quote(p.resolve().as_posix(), safe='/:')}'>"
             "Open in VS Code</a> <span class='lb-dim'>(on this computer)</span>"]
    gi = _git_info(rel) if p.is_file() else {}
    if gi:
        note = " - <span class='lb-dim'>local copy has uncommitted changes</span>" if gi["dirty"] else ""
        links.append(f"<a href='{gi['url']}' target='_blank'>Committed version on GitHub "
                     f"({gi['branch']})</a>{note}")
    elif p.is_file():
        links.append("<span class='lb-dim'>not committed to git, so not on GitHub</span>")
    st.markdown(" &nbsp;·&nbsp; ".join(links), unsafe_allow_html=True)

    if p.is_file() and stat.st_size <= DOWNLOAD_LIMIT:
        st.download_button("Download this file", data=p.read_bytes(), file_name=p.name,
                           key=f"dl_{rel}")
    st.divider()

    try:
        _dispatch(p, rel)
    except Exception as exc:  # a preview must never take the page down
        st.warning(f"Could not preview this file ({type(exc).__name__}: {exc}).")


def _dispatch(p: Path, rel: str) -> None:
    name, suf = p.name.lower(), p.suffix.lower()
    if p.is_dir():
        return _folder(p, rel)
    if suf in (".json", ".geojson"):
        return _json(p)
    if suf == ".md":
        return _markdown(p)
    if suf == ".parquet":
        return _parquet(p)
    if suf == ".duckdb":
        return _duckdb(p)
    if suf in SQLITE:
        return _sqlite(p)
    if suf in (".csv", ".tsv"):
        return _csv(p)
    if suf == ".epw":
        return _epw(p)
    if suf in (".laz", ".las"):
        return _las(p)
    if suf == ".ods":
        return _ods(p)
    if suf == ".zip":
        return _zip(p)
    if suf in IMAGE:
        return st.image(str(p))
    if suf in CODE_LANG or name in ("dockerfile", "makefile", ".gitignore", ".env.example") \
            or name.startswith("docker-compose"):
        return _code(p, CODE_LANG.get(suf, "yaml" if "compose" in name else "bash"))
    if p.stat().st_size < 1_000_000:
        head = p.read_bytes()[:4096]
        if b"\x00" not in head:
            return _code(p, "text")
    st.info("A binary file with no built-in preview. Use the download button "
            "(small files) or open it in its own program.")


# ── previews ────────────────────────────────────────────────────────────────

def _code(p: Path, lang: str) -> None:
    text = p.read_text(encoding="utf-8", errors="replace")
    lines = text.count("\n") + 1
    if len(text) > TEXT_LIMIT:
        st.warning(f"Very large file - showing the first {TEXT_LIMIT:,} characters.")
        text = text[:TEXT_LIMIT]
    st.caption(f"{lines:,} lines")
    st.code(text, language=lang, line_numbers=True)


def _markdown(p: Path) -> None:
    text = p.read_text(encoding="utf-8", errors="replace")
    rendered, source = st.tabs(["Rendered", "Source"])
    with rendered:
        st.markdown(linkify_repo_links(text))
    with source:
        st.code(text, language="markdown", line_numbers=True)


def _trim(obj, depth: int = 0):
    """Shrink nested JSON for display: first few items of every list."""
    if depth > 6:
        return "…"
    if isinstance(obj, list):
        out = [_trim(x, depth + 1) for x in obj[:3]]
        if len(obj) > 3:
            out.append(f"… {len(obj) - 3:,} more")
        return out
    if isinstance(obj, dict):
        items = list(obj.items())
        out = {k: _trim(v, depth + 1) for k, v in items[:40]}
        if len(items) > 40:
            out["…"] = f"{len(items) - 40:,} more keys"
        return out
    return obj


def _records_in(data) -> tuple[str, list] | None:
    """The main list of records in a JSON document, if there is one."""
    if isinstance(data, list) and data and isinstance(data[0], dict):
        return "", data
    if isinstance(data, dict):
        if isinstance(data.get("features"), list):   # GeoJSON
            feats = data["features"]
            rows = [{**(f.get("properties") or {}),
                     "geometry": (f.get("geometry") or {}).get("type")} for f in feats]
            return "features", rows
        lists = [(k, v) for k, v in data.items()
                 if isinstance(v, list) and v and isinstance(v[0], dict)]
        if lists:
            return max(lists, key=lambda kv: len(kv[1]))
        dicts = [(k, list(v.values())) for k, v in data.items()
                 if isinstance(v, dict) and v and all(isinstance(x, dict) for x in list(v.values())[:5])]
        if dicts:
            k, vals = max(dicts, key=lambda kv: len(kv[1]))
            keys = list(data[k].keys())
            return k, [{"(key)": key, **val} for key, val in zip(keys, vals)]
    return None


@st.cache_data(show_spinner="Reading the file…", max_entries=24)
def _json_summary(path: str, mtime: float) -> dict:
    data = json.loads(Path(path).read_text(encoding="utf-8", errors="replace"))
    out = {"type": type(data).__name__,
           "size": len(data) if isinstance(data, (list, dict)) else None,
           "preview": json.dumps(_trim(data), indent=2, ensure_ascii=False)[:60_000]}
    if isinstance(data, dict):
        out["keys"] = [{"key": k, "holds": type(v).__name__,
                        "items": len(v) if isinstance(v, (list, dict)) else "",
                        "value": "" if isinstance(v, (list, dict)) else _short(v)}
                       for k, v in list(data.items())[:200]]
    rec = _records_in(data)
    if rec:
        where, rows = rec
        fields: dict[str, int] = {}
        for r in rows:
            for k, v in r.items():
                if v not in (None, "", [], {}):
                    fields[k] = fields.get(k, 0) + 1
        out["records"] = {"where": where, "n": len(rows),
                          "sample": [{k: _short(v) for k, v in r.items()} for r in rows[:SAMPLE_ROWS]],
                          "filled": [{"field": k, "records with a value": n,
                                      "share": f"{n / len(rows) * 100:.1f}%"}
                                     for k, n in sorted(fields.items(), key=lambda kv: -kv[1])]}
    return out


def _json(p: Path) -> None:
    s = _json_summary(str(p), _mtime(p))
    size = f"{s['size']:,} " + ("items" if s["type"] == "list" else "keys") if s["size"] is not None else ""
    st.markdown(f"**JSON {s['type']}** - {size}")
    rec = s.get("records")
    tabs = st.tabs((["Records", "Field coverage"] if rec else []) + (["Keys"] if s.get("keys") else []) + ["Structure"])
    i = 0
    if rec:
        with tabs[0]:
            where = f" under `{rec['where']}`" if rec["where"] else ""
            st.caption(f"{rec['n']:,} records{where} - first {min(rec['n'], SAMPLE_ROWS)} shown")
            show_dataframe_safe(pd.DataFrame(rec["sample"]))
        with tabs[1]:
            st.caption("How many records carry a value in each field")
            show_dataframe_safe(pd.DataFrame(rec["filled"]))
        i = 2
    if s.get("keys"):
        with tabs[i]:
            show_dataframe_safe(pd.DataFrame(s["keys"]))
        i += 1
    with tabs[i]:
        st.caption("Every list cut to its first three items")
        st.code(s["preview"], language="json")


def _parquet(p: Path) -> None:
    import pyarrow.parquet as pq
    pf = pq.ParquetFile(str(p))
    md = pf.metadata
    st.markdown(f"**Parquet** - {md.num_rows:,} rows × {md.num_columns} columns, "
                f"{md.num_row_groups} row groups")
    schema = pf.schema_arrow
    rows, cols = st.tabs(["First rows", "Columns"])
    with cols:
        show_dataframe_safe(pd.DataFrame({"column": schema.names,
                                          "type": [str(t) for t in schema.types]}))
    with rows:
        batch = next(pf.iter_batches(batch_size=SAMPLE_ROWS), None)
        if batch is not None:
            show_dataframe_safe(_table(batch.to_pylist()))


@st.cache_data(show_spinner="Opening the database…", max_entries=8)
def _duckdb_tables(path: str, mtime: float) -> list[dict]:
    import duckdb
    con = duckdb.connect(path, read_only=True)
    try:
        tabs = con.execute("SELECT table_name, column_count FROM duckdb_tables() ORDER BY 1").fetchall()
        return [{"table": t, "rows": con.execute(f'SELECT COUNT(*) FROM "{t}"').fetchone()[0],
                 "columns": c} for t, c in tabs]
    finally:
        con.close()


@st.cache_data(show_spinner="Reading rows…", max_entries=16)
def _duckdb_sample(path: str, mtime: float, table: str) -> tuple[list[dict], list[dict]]:
    import duckdb
    con = duckdb.connect(path, read_only=True)
    try:
        cols = con.execute("SELECT column_name, data_type FROM information_schema.columns "
                           "WHERE table_name = ? ORDER BY ordinal_position", [table]).fetchall()
        cur = con.execute(f'SELECT * FROM "{table}" LIMIT {SAMPLE_ROWS}')
        names = [d[0] for d in cur.description]
        rows = [{n: _short(v) for n, v in zip(names, r)} for r in cur.fetchall()]
        return rows, [{"column": c, "type": t} for c, t in cols]
    finally:
        con.close()


def _duckdb(p: Path) -> None:
    try:
        import duckdb  # noqa: F401
    except ImportError:
        st.info("Previewing DuckDB needs the `duckdb` package in the logbook's "
                "environment (`.\\setup.bat` installs it).")
        return
    tables = _duckdb_tables(str(p), _mtime(p))
    st.markdown(f"**DuckDB database** - {len(tables)} table(s), opened read-only")
    show_dataframe_safe(pd.DataFrame([{**t, "rows": f"{t['rows']:,}"} for t in tables]))
    if tables:
        names = [x["table"] for x in tables]
        biggest = max(tables, key=lambda x: x["rows"])["table"]
        t = st.selectbox("Table", names, index=names.index(biggest), key=f"duck_{p}")
        rows, cols = _duckdb_sample(str(p), _mtime(p), t)
        a, b = st.tabs([f"First {SAMPLE_ROWS} rows", f"Columns ({len(cols)})"])
        with a:
            show_dataframe_safe(pd.DataFrame(rows))
        with b:
            show_dataframe_safe(pd.DataFrame(cols))


def _sqlite_connect(p: Path) -> sqlite3.Connection:
    try:
        con = sqlite3.connect(p.as_uri() + "?mode=ro", uri=True)
        con.execute("SELECT 1 FROM sqlite_master LIMIT 1")
        return con
    except sqlite3.Error:
        # a WAL database whose -shm cannot be opened read-only
        return sqlite3.connect(p.as_uri() + "?mode=ro&immutable=1", uri=True)


def _sqlite(p: Path) -> None:
    con = _sqlite_connect(p)
    try:
        names = [r[0] for r in con.execute(
            "SELECT name FROM sqlite_master WHERE type IN ('table','view') "
            "AND name NOT LIKE 'sqlite_%' ORDER BY name")]
        info = []
        for n in names:
            cols = con.execute(f'PRAGMA table_info("{n}")').fetchall()
            info.append({"table": n, "rows": con.execute(f'SELECT COUNT(*) FROM "{n}"').fetchone()[0],
                         "columns": len(cols)})
        label = "GeoPackage" if p.suffix.lower() == ".gpkg" else "SQLite database"
        st.markdown(f"**{label}** - {len(names)} table(s), opened read-only")
        show_dataframe_safe(pd.DataFrame([{**t, "rows": f"{t['rows']:,}"} for t in info]))
        if names:
            biggest = max(info, key=lambda x: x["rows"])["table"]
            t = st.selectbox("Table", names, index=names.index(biggest), key=f"sq_{p}")
            cur = con.execute(f'SELECT * FROM "{t}" LIMIT {SAMPLE_ROWS}')
            cols = [d[0] for d in cur.description]
            rows = [dict(zip(cols, r)) for r in cur.fetchall()]
            a, b = st.tabs([f"First {SAMPLE_ROWS} rows", "Columns"])
            with a:
                show_dataframe_safe(_table(rows))
            with b:
                show_dataframe_safe(pd.DataFrame(
                    [{"column": c[1], "type": c[2]} for c in con.execute(f'PRAGMA table_info("{t}")')]))
    finally:
        con.close()


def _csv(p: Path) -> None:
    df = pd.read_csv(p, nrows=SAMPLE_ROWS, sep=None, engine="python")
    st.markdown(f"**CSV** - {len(df.columns)} columns, first {len(df)} rows")
    show_dataframe_safe(df)


def _epw(p: Path) -> None:
    lines = p.read_text(encoding="utf-8", errors="replace").splitlines()
    loc = lines[0].split(",") if lines else []
    if len(loc) >= 10:
        st.markdown(f"**EnergyPlus weather file** - {loc[1]}, {loc[3]} "
                    f"(station {loc[5]}, lat {loc[6]}, lon {loc[7]}, elevation {loc[9]} m)")
    data = pd.read_csv(p, skiprows=8, header=None, nrows=8784)
    data = data.iloc[:, :len(EPW_COLUMNS)]
    data.columns = EPW_COLUMNS[: data.shape[1]]
    summary, rows, header = st.tabs(["Year at a glance", "Hourly rows", "Header"])
    with summary:
        t = data["Dry bulb (°C)"]
        c = st.columns(4)
        c[0].metric("Hours", f"{len(data):,}")
        c[1].metric("Mean temperature", f"{t.mean():.1f} °C")
        c[2].metric("Min / max", f"{t.min():.1f} / {t.max():.1f} °C")
        c[3].metric("Global horizontal", f"{data['Global horizontal (Wh/m²)'].sum() / 1000:,.0f} kWh/m²")
        monthly = data.groupby("Month")["Dry bulb (°C)"].mean().round(1)
        st.caption("Monthly mean dry-bulb temperature (°C)")
        st.bar_chart(monthly)
    with rows:
        show_dataframe_safe(data.head(48))
    with header:
        st.code("\n".join(lines[:8]), language="text")


def _las(p: Path) -> None:
    """LAS/LAZ public header - uncompressed even in LAZ, so readable without laspy."""
    with p.open("rb") as f:
        h = f.read(375)
    if h[:4] != b"LASF":
        st.info("Not a LAS/LAZ file.")
        return
    major, minor = h[24], h[25]
    day, year = struct.unpack("<HH", h[90:94])
    n = struct.unpack("<I", h[107:111])[0]
    if n == 0 and minor >= 4 and len(h) >= 255:
        n = struct.unpack("<Q", h[247:255])[0]
    maxx, minx, maxy, miny, maxz, minz = struct.unpack("<6d", h[179:227])
    software = h[58:90].split(b"\x00")[0].decode("ascii", "replace").strip()
    created = (date(year, 1, 1) + timedelta(days=day - 1)).isoformat() if year and day else "not set"
    st.markdown(f"**Laser point-cloud tile** (LAS {major}.{minor}"
                f"{', compressed LAZ' if p.suffix.lower() == '.laz' else ''})")
    show_dataframe_safe(pd.DataFrame([
        {"property": "Points", "value": f"{n:,}"},
        {"property": "File creation date (header)", "value": created},
        {"property": "Easting range (m)", "value": f"{minx:,.1f} – {maxx:,.1f}"},
        {"property": "Northing range (m)", "value": f"{miny:,.1f} – {maxy:,.1f}"},
        {"property": "Height range (m)", "value": f"{minz:,.1f} – {maxz:,.1f}"},
        {"property": "Written by", "value": software or "-"},
    ]))
    st.caption("Coordinates are in the tile's own reference system (SWEREF 99 TM for the DTCC tiles). "
               "The points themselves are compressed and are not decoded here.")


def _ods(p: Path) -> None:
    with zipfile.ZipFile(p) as z:
        xml = z.read("content.xml").decode("utf-8", "replace")
    sheets = re.findall(r'<table:table [^>]*table:name="([^"]+)"', xml)
    st.markdown(f"**OpenDocument spreadsheet** - {len(sheets)} sheet(s)")
    show_dataframe_safe(pd.DataFrame({"sheet": sheets}))
    st.caption("Open it in LibreOffice or Excel to see the cells; the tool's parser "
               "turns the tables it needs into JSON.")


def _zip(p: Path) -> None:
    with zipfile.ZipFile(p) as z:
        infos = z.infolist()
    st.markdown(f"**Zip archive** - {len(infos):,} member(s)")
    show_dataframe_safe(pd.DataFrame([{"name": i.filename, "size": _human_size(i.file_size),
                                       "modified": datetime(*i.date_time).strftime("%Y-%m-%d")}
                                      for i in infos[:500]]))


def _folder(p: Path, rel: str) -> None:
    entries = sorted(p.iterdir(), key=lambda e: (e.is_file(), e.name.lower()))
    entries = [e for e in entries if not is_blocked(f"{rel}/{e.name}")]
    shown = entries[:500]
    st.markdown(f"**Folder** - {len(entries):,} item(s)"
                + (f", first {len(shown)} shown" if len(entries) > len(shown) else ""))
    rows = []
    for e in shown:
        child = f"{rel}/{e.name}"
        rows.append({
            "name": e.name + ("/" if e.is_dir() else ""),
            "type": "folder" if e.is_dir() else (e.suffix.lstrip(".") or "file"),
            "size": "" if e.is_dir() else _human_size(e.stat().st_size),
            "modified": datetime.fromtimestamp(e.stat().st_mtime).strftime("%Y-%m-%d"),
            "open": viewer_href(child) if is_allowed(child) else "",
        })
    show_dataframe_safe(pd.DataFrame(rows), column_config={
        "open": st.column_config.LinkColumn("open", display_text="view ↗")})
