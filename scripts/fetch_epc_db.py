#!/usr/bin/env python3
"""Ensure the national EPC register (epc_sweden.duckdb) is present.

The DB (~461 MB) powers the AI-chat "ask about the whole EPC dataset" feature.
It is too big for git, so it travels separately as a zip. This script makes it
appear at data/sensitivity/epc_sweden.duckdb using whichever source is available,
in order:

  1. Already there            -> nothing to do.
  2. Local zip in the folder  -> unzip data/sensitivity/epc_sweden.duckdb.zip.
  3. Download URL (EPC_DB_URL)-> fetch the zip, then unzip. For a private GitHub
                                 Release asset, also set EPC_DB_TOKEN (a token
                                 with repo access) and point EPC_DB_URL at the
                                 asset API URL.
  4. None of the above        -> print instructions and exit 0 (the core tool
                                 still runs fine; only dataset-wide EPC chat is
                                 disabled).

Runs automatically on `docker compose up` (wired into the backend command), and
can be run by hand:  python scripts/fetch_epc_db.py
Standard library only, so it works in the slim backend image with no extra deps.
"""
from __future__ import annotations

import os
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB = ROOT / "data" / "sensitivity" / "epc_sweden.duckdb"
ZIP = ROOT / "data" / "sensitivity" / "epc_sweden.duckdb.zip"


def _log(msg: str) -> None:
    print(f"[fetch_epc_db] {msg}", flush=True)


def _unzip(zip_path: Path) -> bool:
    """Extract the .duckdb out of zip_path into place. Returns True on success."""
    try:
        with zipfile.ZipFile(zip_path) as zf:
            member = next((n for n in zf.namelist() if n.endswith(".duckdb")), None)
            if member is None:
                _log(f"no .duckdb inside {zip_path.name} — cannot use it")
                return False
            DB.parent.mkdir(parents=True, exist_ok=True)
            tmp = DB.with_suffix(".duckdb.tmp")
            with zf.open(member) as src, open(tmp, "wb") as out:
                # Stream so we never hold the whole 461 MB in memory.
                while chunk := src.read(1024 * 1024):
                    out.write(chunk)
            tmp.replace(DB)
        _log(f"unzipped -> {DB.relative_to(ROOT)} ({DB.stat().st_size // 1048576} MB)")
        return True
    except Exception as e:  # noqa: BLE001
        _log(f"failed to unzip {zip_path.name}: {e}")
        return False


def _download(url: str, token: str | None, dest: Path) -> bool:
    """Download url -> dest (streamed). Adds auth for private GitHub assets."""
    import urllib.request

    req = urllib.request.Request(url)
    if token:
        # Works for a private GitHub Release asset API URL.
        req.add_header("Authorization", f"Bearer {token}")
        req.add_header("Accept", "application/octet-stream")
    _log(f"downloading EPC zip from {url.split('?')[0]} ...")
    try:
        dest.parent.mkdir(parents=True, exist_ok=True)
        tmp = dest.with_suffix(dest.suffix + ".part")
        with urllib.request.urlopen(req, timeout=120) as r, open(tmp, "wb") as out:
            while chunk := r.read(1024 * 1024):
                out.write(chunk)
        tmp.replace(dest)
        _log(f"downloaded {dest.stat().st_size // 1048576} MB -> {dest.name}")
        return True
    except Exception as e:  # noqa: BLE001
        _log(f"download failed: {e}")
        return False


def main() -> int:
    if DB.exists():
        _log(f"present ({DB.stat().st_size // 1048576} MB) — nothing to do")
        return 0

    if ZIP.exists():
        _log(f"found local {ZIP.name}, unzipping")
        return 0 if _unzip(ZIP) else 0  # non-fatal either way

    url = os.environ.get("EPC_DB_URL")
    if url:
        token = os.environ.get("EPC_DB_TOKEN")
        if _download(url, token, ZIP):
            _unzip(ZIP)
        return 0

    _log(
        "EPC register not found and no source configured. The core tool runs "
        "fine; only dataset-wide EPC chat is disabled. To enable it, either drop "
        "epc_sweden.duckdb.zip into data/sensitivity/, or set EPC_DB_URL "
        "(and EPC_DB_TOKEN for a private GitHub Release), then rerun this script "
        "or restart the stack."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
