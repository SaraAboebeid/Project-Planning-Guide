"""
Every domestic EPC for one local authority, with all certificate fields, from
the EPC register's full-load archive (domestic-csv.zip, ~8 GB, one CSV per
lodgement year).

Why: the per-certificate /api/certificate route is rate limited to roughly one
call every 2 s, so Rotherham's ~25k missing details would take most of a day,
and it doesn't return the fabric descriptions the energy model needs
(walls_description, roof_description, windows_description, floor_description).
The archive has all of them. It is streamed over HTTP Range requests and
filtered line by line, so nothing but the local authority's rows is written.

Output: data/uk_raw/epc_bulk_<la_code>.csv  (same columns as the archive)

Usage:
    python tools/uk/ingest_epc_bulk.py [--la E08000018] [--workers 4]
"""
from __future__ import annotations

import argparse
import csv
import io
import time
import zipfile
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

import requests

import ingest_epc
from remote_zip import HttpRangeFile

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "uk_raw"


def _archive_url() -> str:
    """Pre-signed S3 URL (short-lived), fetched fresh per worker."""
    r = requests.get(f"{ingest_epc.BASE_URL}/api/files/domestic/csv",
                     headers={"Authorization": f"Bearer {ingest_epc._token()}"},
                     allow_redirects=False, timeout=60)
    r.raise_for_status()
    return r.headers["Location"]


def _filter_member(member: str, la: str) -> tuple[str, list[str], str | None, int]:
    """Stream one yearly CSV; return (member, matching raw lines, header, lines scanned)."""
    for attempt in range(3):
        try:
            z = zipfile.ZipFile(HttpRangeFile(_archive_url, block=16 << 20))
            with z.open(member) as fh:
                text = io.TextIOWrapper(fh, encoding="utf-8", newline="")
                header = text.readline()
                cols = next(csv.reader([header]))
                la_idx = cols.index("local_authority")
                needle = f",{la},"
                keep, n = [], 0
                for line in text:
                    n += 1
                    # Cheap substring test first; confirm on the parsed column.
                    if needle in line:
                        row = next(csv.reader([line]))
                        if len(row) > la_idx and row[la_idx] == la:
                            keep.append(line)
                return member, keep, header, n
        except Exception as exc:  # noqa: BLE001 - expired URL / dropped connection: retry fresh
            print(f"  {member}: attempt {attempt + 1} failed ({exc.__class__.__name__}: {exc})", flush=True)
            time.sleep(10)
    return member, [], None, 0


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--la", default="E08000018", help="ONS local authority code (Rotherham = E08000018)")
    ap.add_argument("--workers", type=int, default=4)
    args = ap.parse_args()

    out = RAW / f"epc_bulk_{args.la}.csv"
    z = zipfile.ZipFile(HttpRangeFile(_archive_url))
    members = sorted(i.filename for i in z.infolist() if i.filename.startswith("certificates") and i.filename.endswith(".csv"))
    print(f"{len(members)} yearly files to scan for {args.la}", flush=True)

    header, total, scanned = None, 0, 0
    t0 = time.time()
    tmp = out.with_suffix(".part")
    with open(tmp, "w", encoding="utf-8", newline="") as fh, ProcessPoolExecutor(args.workers) as pool:
        futures = [pool.submit(_filter_member, m, args.la) for m in members]
        for fut in as_completed(futures):
            member, lines, h, n = fut.result()
            if h and header is None:
                header = h
                fh.write(header)
            fh.writelines(lines)
            total += len(lines); scanned += n
            print(f"  {member}: {len(lines):,} rows ({n:,} scanned) - {time.time() - t0:.0f}s", flush=True)
    tmp.replace(out)
    print(f"{total:,} certificates -> {out.relative_to(ROOT)} ({scanned:,} rows scanned)")


if __name__ == "__main__":
    main()
