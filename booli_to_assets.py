"""booli_to_assets.py — export booli_listings.db → assets/ + frontend/public/
booli_data.json, and copy each listing's images into <root>/booli_images/<id>/.

The JSON is keyed by normalised street address (same convention as boplats) so
the 3-D viewer can join a Booli listing to a building. Each entry carries the
parsed fields, local image paths, and the full raw ad under `raw` so nothing is
lost.
"""
import json
import re
import shutil
import sqlite3
import sys
from pathlib import Path

try:  # UTF-8 stdout so Swedish characters can't crash a cp1252 scheduled run
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

DB_PATH = Path("booli_listings.db")
IMG_SRC = Path("booli_images")
OUT = [Path("assets/booli_data.json"), Path("frontend/public/booli_data.json")]
IMG_DST = [Path("assets/booli_images"), Path("frontend/public/booli_images")]

FIELDS = ["id", "status", "url", "address", "area_name", "object_type", "tenure",
          "construction_year", "rooms", "living_area_m2", "floor",
          "list_price", "sold_price", "sold_date",
          "monthly_fee", "sqm_price", "energy_class", "agency_name",
          "developer", "association", "is_new_construction",
          "latitude", "longitude", "n_images", "primary_image",
          "raw_json", "first_seen", "last_seen"]


def norm(s: str) -> str:
    s = (s or "").strip().lower()
    s = re.sub(r"\s+", " ", s)
    s = re.sub(r"\s+\d{4}$", "", s)     # drop trailing 4-digit unit codes
    return s


def _images_for(listing_id: str) -> list:
    d = IMG_SRC / listing_id
    if not d.exists():
        return []
    files = sorted(d.glob("*.webp"), key=lambda p: int(p.stem) if p.stem.isdigit() else 0)
    return [f"/booli_images/{listing_id}/{f.name}" for f in files]


def _copy_images():
    for dst in IMG_DST:
        dst.mkdir(parents=True, exist_ok=True)
    copied = 0
    for src in IMG_SRC.glob("*/*.webp") if IMG_SRC.exists() else []:
        rel = src.relative_to(IMG_SRC)
        for dst in IMG_DST:
            target = dst / rel
            if not target.exists():
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(src, target)
                copied += 1
    return copied


def main():
    if not DB_PATH.exists():
        print("No booli_listings.db — run booli_scraper.py first.")
        return
    copied = _copy_images()

    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.execute("PRAGMA busy_timeout=5000")
    rows = conn.execute(
        f"SELECT {','.join(FIELDS)} FROM listings WHERE address IS NOT NULL"
    ).fetchall()
    conn.close()

    lookup: dict[str, list] = {}
    for row in rows:
        rec = dict(zip(FIELDS, row))
        raw = {}
        try:
            raw = json.loads(rec.pop("raw_json") or "{}")
        except Exception:
            rec.pop("raw_json", None)
        rec["images"] = _images_for(rec["id"])
        rec["raw"] = raw                     # complete ad, nothing dropped
        lookup.setdefault(norm(rec["address"]), []).append(rec)

    payload = json.dumps(lookup, ensure_ascii=False, indent=None)
    for p in OUT:
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(payload, encoding="utf-8")
    print(f"Images: {copied} copied. JSON: {len(rows)} listings, "
          f"{len(lookup)} unique addresses -> {', '.join(str(p) for p in OUT)}")


if __name__ == "__main__":
    main()
