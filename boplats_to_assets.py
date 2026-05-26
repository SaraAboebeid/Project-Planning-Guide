"""
boplats_to_assets.py
Exports boplats SQLite data → assets/boplats_data.json
and copies floor plan images   → assets/boplats_images/
Run whenever new scrape data is available.
"""
import json, re, shutil, sqlite3
from pathlib import Path

DB_PATH     = Path('boplats_apartments.db')
IMG_SRC_DIR = Path('boplats_images')
ASSETS_DIR  = Path('assets')
OUT_JSON    = ASSETS_DIR / 'boplats_data.json'
OUT_IMG_DIR = ASSETS_DIR / 'boplats_images'

def norm(s: str) -> str:
    """Normalise address for matching against 3-D building addresses."""
    s = s.strip().lower()
    s = re.sub(r'\s+', ' ', s)
    # strip trailing 4-digit apartment unit codes like "1004", "1401"
    s = re.sub(r'\s+\d{4}$', '', s)
    return s

def main():
    # ── Copy images ──────────────────────────────────────────────────────────
    OUT_IMG_DIR.mkdir(parents=True, exist_ok=True)
    copied = 0
    for src in IMG_SRC_DIR.glob('*.jpg'):
        dst = OUT_IMG_DIR / src.name
        if not dst.exists():
            shutil.copy2(src, dst)
            copied += 1
    print(f'Images: {copied} copied to {OUT_IMG_DIR}  ({len(list(OUT_IMG_DIR.glob("*.jpg")))} total)')

    # ── Read DB ──────────────────────────────────────────────────────────────
    conn = sqlite3.connect(DB_PATH)
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

    OUT_JSON.write_text(json.dumps(lookup, ensure_ascii=False, indent=None), encoding='utf-8')
    print(f'JSON: {len(lookup)} unique addresses → {OUT_JSON}  ({OUT_JSON.stat().st_size//1024} KB)')

if __name__ == '__main__':
    main()
