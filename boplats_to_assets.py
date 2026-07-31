"""
boplats_to_assets.py
Exports boplats SQLite data → assets/boplats_data.json
and copies floor plan images   → assets/boplats_images/
Run whenever new scrape data is available.
"""
import json, re, shutil, sqlite3, sys
from pathlib import Path

# Force UTF-8 output on Windows so a stray non-ASCII char in a print can't crash
# a scheduled run whose stdout is redirected to a cp1252 file.
if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

DB_PATH     = Path('boplats_apartments.db')
IMG_SRC_DIR = Path('boplats_images')
ASSETS_DIR  = Path('assets')
FRONTEND_PUBLIC_DIR = Path('frontend/public')
OUT_JSON_ASSETS = ASSETS_DIR / 'boplats_data.json'
OUT_JSON_FRONTEND = FRONTEND_PUBLIC_DIR / 'boplats_data.json'
OUT_IMG_DIR_ASSETS = ASSETS_DIR / 'boplats_images'
OUT_IMG_DIR_FRONTEND = FRONTEND_PUBLIC_DIR / 'boplats_images'

def norm(s: str) -> str:
    """Normalise address for matching against 3-D building addresses."""
    s = s.strip().lower()
    s = re.sub(r'\s+', ' ', s)
    # strip trailing 4-digit apartment unit codes like "1004", "1401"
    s = re.sub(r'\s+\d{4}$', '', s)
    return s

def main():
    # ── Copy images ──────────────────────────────────────────────────────────
    OUT_IMG_DIR_ASSETS.mkdir(parents=True, exist_ok=True)
    OUT_IMG_DIR_FRONTEND.mkdir(parents=True, exist_ok=True)
    copied = 0
    for src in IMG_SRC_DIR.glob('*.jpg'):
        dst_assets = OUT_IMG_DIR_ASSETS / src.name
        dst_frontend = OUT_IMG_DIR_FRONTEND / src.name
        if not dst_assets.exists() or not dst_frontend.exists():
            shutil.copy2(src, dst_assets)
            shutil.copy2(src, dst_frontend)
            copied += 1
    print(f'Images: {copied} synced to {OUT_IMG_DIR_ASSETS} and {OUT_IMG_DIR_FRONTEND}  ({len(list(OUT_IMG_DIR_ASSETS.glob("*.jpg")))} total)')

    # ── Read DB (read-only) ──────────────────────────────────────────────────
    # Open in read-only URI mode: the exporter only ever SELECTs, and a plain
    # read-write connect uses rollback-journal mode, which can leave a hot
    # `.db-journal` behind that jams the next scraper run with a disk-I/O error.
    # `mode=ro` guarantees we never create a journal at all.
    conn = sqlite3.connect(f"file:{DB_PATH.as_posix()}?mode=ro", uri=True, timeout=30)
    conn.execute("PRAGMA busy_timeout=5000")   # wait out a concurrent scrape write
    rows = conn.execute(
        'SELECT id, address, rooms, size_m2, rent_sek, '
        'floor_current, floor_total, floorplan_image_path, last_seen '
        'FROM apartments WHERE address IS NOT NULL'
    ).fetchall()
    conn.close()

    # ── Build lookup dict keyed by normalised address ────────────────────────
    lookup: dict[str, list] = {}
    for apt_id, address, rooms, size_m2, rent_sek, floor_cur, floor_tot, img_path, last_seen in rows:
        key = norm(address)
        apt = {
            'id':            apt_id,
            'address':       address,
            'rooms':         rooms,
            'size_m2':       size_m2,
            'rent_sek':      rent_sek,
            'floor_current': floor_cur,
            'floor_total':   floor_tot,
            # Serve image from /boplats_images/<id>.jpg (assets/ root)
            'image':         f'/boplats_images/{apt_id}.jpg' if img_path else None,
            'last_seen':     last_seen,
        }
        lookup.setdefault(key, []).append(apt)

    payload = json.dumps(lookup, ensure_ascii=False, indent=None)
    OUT_JSON_ASSETS.write_text(payload, encoding='utf-8')
    OUT_JSON_FRONTEND.write_text(payload, encoding='utf-8')
    print(
        f'JSON: {len(lookup)} unique addresses -> {OUT_JSON_ASSETS} and {OUT_JSON_FRONTEND} '
        f'({OUT_JSON_ASSETS.stat().st_size//1024} KB)'
    )

if __name__ == '__main__':
    main()
