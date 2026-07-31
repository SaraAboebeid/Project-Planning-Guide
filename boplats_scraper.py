#!/usr/bin/env python3
"""
boplats_scraper.py

Fetches all first-hand rental apartments from boplats.se for the configured area,
extracts rooms, floor, rent, and floor plan image, and saves to a local SQLite database.

Usage:
    python boplats_scraper.py                  # scrape once and exit
    python boplats_scraper.py --watch 60       # re-scrape every 60 minutes
    python boplats_scraper.py --export         # dump current DB to boplats_apartments.json

The database is saved to:  boplats_apartments.db
Floor plan images saved to: boplats_images/<apartment_id>.jpg
"""

import argparse
import json
import re
import sqlite3
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

# Force UTF-8 output on Windows so Swedish characters print correctly
if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

import requests
from bs4 import BeautifulSoup

# ── configuration ─────────────────────────────────────────────────────────────
BASE_URL   = "https://boplats.se"
SEARCH_URL = f"{BASE_URL}/sok?types=1hand&area=508A8CB406FE001F00030A60"
DB_PATH    = Path("boplats_apartments.db")
IMAGES_DIR = Path("boplats_images")

# Polite crawl delay between requests (seconds)
REQUEST_DELAY = 1.2

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9,sv;q=0.8",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}
# ──────────────────────────────────────────────────────────────────────────────


def get_session() -> requests.Session:
    s = requests.Session()
    s.headers.update(HEADERS)
    return s


# ── database ──────────────────────────────────────────────────────────────────

def _connect(db_path) -> sqlite3.Connection:
    """Open the DB resiliently. WAL journalling avoids the rollback-journal that
    can jam an entire run if a commit is interrupted mid-write (a crashed run
    self-recovers on next open instead of leaving a stuck hot journal). The busy
    timeout waits out a momentary lock from antivirus / backup / the indexer
    rather than immediately raising a disk-I/O error."""
    conn = sqlite3.connect(db_path, timeout=30)
    try:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA busy_timeout=5000")
        conn.execute("PRAGMA synchronous=NORMAL")
    except sqlite3.OperationalError:
        pass
    return conn


def _commit_with_retry(conn, attempts: int = 5, base_delay: float = 0.4) -> None:
    """Commit, retrying transient disk-I/O / lock errors with linear backoff so a
    brief filesystem hiccup can't abort the run and leave the DB jammed."""
    import time
    for i in range(attempts):
        try:
            conn.commit()
            return
        except sqlite3.OperationalError:
            if i == attempts - 1:
                raise
            time.sleep(base_delay * (i + 1))


def _exec_retry(conn, sql: str, params: tuple = (), attempts: int = 5, base_delay: float = 0.4):
    """Run a single statement, retrying transient 'database is locked' / disk-I/O
    errors. `_commit_with_retry` only guarded the commit, but a locked SELECT or
    INSERT raises here too — uncaught, that crashes the whole scheduled run."""
    import time
    for i in range(attempts):
        try:
            return conn.execute(sql, params)
        except sqlite3.OperationalError:
            if i == attempts - 1:
                raise
            time.sleep(base_delay * (i + 1))


def init_db(db_path: Path) -> sqlite3.Connection:
    conn = _connect(db_path)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS apartments (
            id                   TEXT PRIMARY KEY,
            url                  TEXT NOT NULL,
            address              TEXT,
            area_name            TEXT,
            rooms                INTEGER,
            size_m2              REAL,
            floor_current        TEXT,
            floor_total          TEXT,
            rent_sek             INTEGER,
            move_in_date         TEXT,
            apply_by             TEXT,
            floorplan_image_path TEXT,
            floorplan_image_url  TEXT,
            first_seen           TEXT NOT NULL,
            last_seen            TEXT NOT NULL
        )
    """)
    _commit_with_retry(conn)
    return conn


def upsert_apartment(conn: sqlite3.Connection, apt: dict, now: str) -> bool:
    """Insert or update apartment. Returns True if this is a new record."""
    row = _exec_retry(
        conn, "SELECT first_seen FROM apartments WHERE id = ?", (apt["id"],)
    ).fetchone()
    first_seen = row[0] if row else now
    is_new = row is None

    _exec_retry(
        conn,
        """
        INSERT OR REPLACE INTO apartments
          (id, url, address, area_name, rooms, size_m2,
           floor_current, floor_total, rent_sek, move_in_date, apply_by,
           floorplan_image_path, floorplan_image_url, first_seen, last_seen)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """,
        (
            apt["id"], apt["url"], apt.get("address"), apt.get("area_name"),
            apt.get("rooms"), apt.get("size_m2"),
            apt.get("floor_current"), apt.get("floor_total"),
            apt.get("rent_sek"), apt.get("move_in_date"), apt.get("apply_by"),
            apt.get("floorplan_image_path"), apt.get("floorplan_image_url"),
            first_seen, now,
        ),
    )
    _commit_with_retry(conn)
    return is_new


# ── scraping ──────────────────────────────────────────────────────────────────

def get_listing_urls(session: requests.Session) -> list:
    """Return all apartment detail URLs from the search results page."""
    resp = session.get(SEARCH_URL, timeout=20)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "lxml")

    seen = set()
    urls = []
    for a in soup.find_all("a", href=True):
        href = a["href"]
        # Normalise to absolute URL
        if href.startswith("/"):
            href = BASE_URL + href
        if "/objekt/1hand/" not in href:
            continue
        # Skip sub-pages like /floorplans and /photos
        path = href.replace(BASE_URL, "")
        if path.count("/") > 3:
            continue
        if href not in seen:
            seen.add(href)
            urls.append(href)
    return urls


def _clean_number(text: str) -> str:
    """Strip non-digit characters (spaces, thin spaces, nbsp) from a number string."""
    return re.sub(r"[^\d]", "", text)


def parse_detail(session: requests.Session, url: str) -> dict | None:
    """Fetch apartment detail page and return structured dict, or None on error."""
    try:
        resp = session.get(url, timeout=20)
        resp.raise_for_status()
    except Exception as exc:
        print(f"  ERROR fetching {url}: {exc}")
        return None

    soup = BeautifulSoup(resp.text, "lxml")
    text = soup.get_text(" ", strip=True)

    apt_id = url.rstrip("/").split("/")[-1]
    data: dict = {
        "id":                   apt_id,
        "url":                  url,
        "address":              None,
        "area_name":            None,
        "rooms":                None,
        "size_m2":              None,
        "floor_current":        None,
        "floor_total":          None,
        "rent_sek":             None,
        "move_in_date":         None,
        "apply_by":             None,
        "floorplan_image_url":  None,
        "floorplan_image_path": None,
    }

    # Address — first <h2> on the page
    h2 = soup.find("h2")
    if h2:
        data["address"] = h2.get_text(strip=True).strip(". ")

    # Area name — e.g. "Gårdstensberget, Angered, Göteborg"
    m = re.search(r"([\w\u00c0-\u017e\s-]+),\s*[\w\u00c0-\u017e\s]+,\s*G[öo]teborg", text)
    if m:
        data["area_name"] = m.group(0).strip()

    # Rooms + size: "Rooms: 1 room(s) in 45.9 m²"
    m = re.search(r"Rooms:\s*(\d+)\s*room\(s\)\s*in\s*([\d.,]+)\s*m", text)
    if m:
        data["rooms"]   = int(m.group(1))
        data["size_m2"] = float(m.group(2).replace(",", "."))

    # Floor: "Floor: 0 of 7"  or  "Floor: 3"
    m = re.search(r"Floor:\s*(\d+)\s*(?:of\s*(\d+))?", text)
    if m:
        data["floor_current"] = m.group(1)
        data["floor_total"]   = m.group(2)  # None if "of N" not present

    # Rent: "4 952  SEK/month"  (spaces inside the number are common)
    m = re.search(r"Rent:\s*([\d\s\u00a0\u202f]+)\s*SEK/month", text)
    if m:
        clean = _clean_number(m.group(1))
        data["rent_sek"] = int(clean) if clean else None

    # Move-in date
    m = re.search(r"Move in date:\s*(.+?)(?:\s+Floor:|\s+Apply by:|$)", text)
    if m:
        data["move_in_date"] = m.group(1).strip()[:30]

    # Apply-by date
    m = re.search(r"Apply by:\s*(.+?)(?:\s+Show terms|\s+Queue time|$)", text)
    if m:
        data["apply_by"] = m.group(1).strip()[:30]

    return data


def fetch_floorplan(session: requests.Session, apt_id: str) -> tuple:
    """
    Fetch the /floorplans page, extract image URL, download to IMAGES_DIR.
    Returns (local_path_str | None, image_url | None).
    """
    fp_url = f"{BASE_URL}/objekt/1hand/{apt_id}/floorplans"
    try:
        resp = session.get(fp_url, timeout=20)
        resp.raise_for_status()
    except Exception as exc:
        print(f"  WARN floorplan page error: {exc}")
        return None, None

    soup = BeautifulSoup(resp.text, "lxml")
    img_tag = soup.find("img", src=re.compile(r"/bilder/"))
    if not img_tag:
        return None, None

    img_url = img_tag["src"]
    if not img_url.startswith("http"):
        img_url = BASE_URL + img_url

    IMAGES_DIR.mkdir(exist_ok=True)
    local_path = IMAGES_DIR / f"{apt_id}.jpg"

    try:
        time.sleep(REQUEST_DELAY)
        img_resp = session.get(img_url, timeout=30)
        img_resp.raise_for_status()
        local_path.write_bytes(img_resp.content)
        return str(local_path), img_url
    except Exception as exc:
        print(f"  WARN image download error: {exc}")
        return None, img_url


# ── main pipeline ─────────────────────────────────────────────────────────────

def run_scrape():
    now  = datetime.now(timezone.utc).isoformat()
    conn = init_db(DB_PATH)
    session = get_session()

    print(f"\n[{now[:19]}] Fetching listing page ...")
    try:
        urls = get_listing_urls(session)
    except Exception as exc:
        print(f"  FATAL: could not fetch listing page: {exc}")
        conn.close()
        return

    print(f"  Found {len(urls)} apartment(s)\n")
    new_count = updated_count = error_count = 0

    for i, url in enumerate(urls, 1):
        apt_id = url.rstrip("/").split("/")[-1]
        print(f"  [{i:>3}/{len(urls)}] {apt_id}", end="  ", flush=True)

        time.sleep(REQUEST_DELAY)
        apt = parse_detail(session, url)
        if apt is None:
            print("SKIP (fetch error)")
            error_count += 1
            continue

        # Only download floor plan if we don't have it yet
        existing = _exec_retry(
            conn,
            "SELECT floorplan_image_path, floorplan_image_url FROM apartments WHERE id = ?",
            (apt_id,),
        ).fetchone()
        has_image = existing and existing[0] and Path(existing[0]).exists()

        if not has_image:
            time.sleep(REQUEST_DELAY)
            img_path, img_url = fetch_floorplan(session, apt_id)
            apt["floorplan_image_path"] = img_path
            apt["floorplan_image_url"]  = img_url
        else:
            apt["floorplan_image_path"] = existing[0]
            apt["floorplan_image_url"]  = existing[1]

        is_new = upsert_apartment(conn, apt, now)

        tag = "NEW " if is_new else "OK  "
        rooms = f"{apt.get('rooms')}R" if apt.get("rooms") else "?R"
        floor = f"{apt.get('floor_current')}/{apt.get('floor_total') or '?'}"
        rent  = f"{apt.get('rent_sek')} SEK" if apt.get("rent_sek") else "? SEK"
        img   = "img" if apt.get("floorplan_image_path") else "no img"
        print(f"{tag}| {apt.get('address', '?'):30s} | {rooms:3s} | {floor:5s} | {rent:10s} | {img}")

        if is_new:
            new_count += 1
        else:
            updated_count += 1

    print(f"\n  -- {new_count} new  |  {updated_count} updated  |  {error_count} errors")
    print(f"     Database : {DB_PATH.resolve()}")
    print(f"     Images   : {IMAGES_DIR.resolve()}\n")
    conn.close()


def export_json():
    if not DB_PATH.exists():
        print("No database found. Run a scrape first.")
        return
    conn = _connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    rows = conn.execute("SELECT * FROM apartments ORDER BY first_seen DESC").fetchall()
    out = [dict(r) for r in rows]
    conn.close()
    out_path = Path("boplats_apartments.json")
    out_path.write_text(json.dumps(out, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Exported {len(out)} records → {out_path.resolve()}")


def main():
    parser = argparse.ArgumentParser(description="Scrape boplats.se apartment listings")
    parser.add_argument(
        "--watch", type=int, metavar="MINUTES", default=0,
        help="Re-scrape every N minutes (0 = run once and exit)",
    )
    parser.add_argument(
        "--export", action="store_true",
        help="Export current database to boplats_apartments.json and exit",
    )
    args = parser.parse_args()

    if args.export:
        export_json()
        return

    run_scrape()

    if args.watch > 0:
        interval_s = args.watch * 60
        print(f"Watching — next scrape in {args.watch} min. Press Ctrl+C to stop.\n")
        while True:
            try:
                time.sleep(interval_s)
                run_scrape()
            except KeyboardInterrupt:
                print("\nStopped.")
                break


if __name__ == "__main__":
    main()
