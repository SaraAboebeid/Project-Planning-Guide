#!/usr/bin/env python3
"""booli_scraper.py — direct Booli.se scraper (no paid API), same spirit as
boplats_scraper.py. Booli is a Next.js site: every search page ships its data as
JSON in a <script id="__NEXT_DATA__"> tag (Apollo normalised state). We read the
Listing (for-sale / upcoming) and SoldProperty (sold) entities from there, per
area, per status, paginated — and store everything + the raw JSON + all images in
booli_listings.db.

⚠ Booli sits behind Cloudflare. This works at modest (city) volume with polite
delays; scraping ALL of Sweden will very likely be challenged/blocked and may
breach Booli's terms — throttle hard and prefer per-city runs.

Find an area's id by searching on booli.se and copying `areaIds=` from the URL.

    python booli_scraper.py --test 1        # fetch+parse Stockholm(id 1), print, no DB
    python booli_scraper.py                  # scrape BOOLI_AREA_IDS statuses → DB
    python booli_scraper.py --sample         # dump one raw listing's keys

Config (.env):
    BOOLI_AREA_IDS      comma-separated area ids (required for a real run)
    BOOLI_MAX_ITEMS     per area+status cap (default 200)
    BOOLI_MAX_PAGES     page cap per area+status (default 20)
    BOOLI_DELAY         seconds between requests (default 1.5)
    BOOLI_STATUSES      subset of: for_sale,sold,upcoming (default all)
"""
import hashlib
import json
import os
import re
import sqlite3
import sys
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

import requests

DB_PATH = Path("booli_listings.db")
IMG_DIR = Path("booli_images")
BASE = "https://www.booli.se"
IMG_CDN = "https://bcdn.se/images/cache/{id}_1280x0.webp"
STATUS_PATH = {"for_sale": "till-salu", "sold": "slutpriser", "upcoming": "kommande"}
HEADERS = {
    "User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                   "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"),
    "Accept-Language": "sv,en;q=0.8",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}


# ── env / config ──────────────────────────────────────────────────────────────
def _load_env() -> dict:
    env = {}
    p = Path(__file__).with_name(".env")
    if p.exists():
        for line in p.read_text(encoding="utf-8", errors="ignore").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip().strip('"').strip("'")
    env.update({k: v for k, v in os.environ.items() if k.startswith("BOOLI_")})
    return env


# ── resilient SQLite ──────────────────────────────────────────────────────────
def _connect(db_path) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path, timeout=30)
    try:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA busy_timeout=5000")
        conn.execute("PRAGMA synchronous=NORMAL")
    except sqlite3.OperationalError:
        pass
    return conn


def _commit_with_retry(conn, attempts=5, base_delay=0.4):
    for i in range(attempts):
        try:
            conn.commit(); return
        except sqlite3.OperationalError:
            if i == attempts - 1:
                raise
            time.sleep(base_delay * (i + 1))


def init_db() -> sqlite3.Connection:
    conn = _connect(DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS listings (
            id TEXT PRIMARY KEY, status TEXT, url TEXT, address TEXT, area_name TEXT,
            object_type TEXT, tenure TEXT, construction_year INTEGER, rooms REAL,
            living_area_m2 REAL, floor TEXT, list_price INTEGER, sold_price INTEGER,
            sold_date TEXT, monthly_fee INTEGER, sqm_price INTEGER, energy_class TEXT,
            agency_name TEXT, developer TEXT, association TEXT, latitude REAL,
            longitude REAL, is_new_construction INTEGER, n_images INTEGER,
            primary_image TEXT, raw_json TEXT NOT NULL, first_seen TEXT NOT NULL,
            last_seen TEXT NOT NULL
        )
    """)
    _commit_with_retry(conn)
    return conn


# ── Apollo/__NEXT_DATA__ parsing ──────────────────────────────────────────────
_ARG_SUFFIX = re.compile(r"\(.*\)$")


def _next_data(html: str) -> dict:
    m = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>',
                  html, re.S)
    if not m:
        raise RuntimeError("no __NEXT_DATA__ (page shape changed or was blocked)")
    return json.loads(m.group(1))


def _resolve(apollo: dict, v, depth=0):
    """Resolve Apollo {__ref} pointers and strip GraphQL arg suffixes from keys."""
    if depth > 7:
        return v
    if isinstance(v, dict):
        if "__ref" in v:
            return _resolve(apollo, apollo.get(v["__ref"], {}), depth + 1)
        return {_ARG_SUFFIX.sub("", k): _resolve(apollo, x, depth + 1) for k, x in v.items()}
    if isinstance(v, list):
        return [_resolve(apollo, x, depth + 1) for x in v]
    return v


def _fetch(session: requests.Session, url: str) -> str:
    r = session.get(url, timeout=25)
    if r.status_code in (403, 429) or "Just a moment" in r.text[:600] or "cf-chl" in r.text[:2000]:
        raise RuntimeError(f"Cloudflare/blocked at {url} (status {r.status_code}) — "
                           f"throttle harder or stop; direct scraping is rate-limited")
    r.raise_for_status()
    return r.text


# ── field extraction ──────────────────────────────────────────────────────────
def _pick(item, *paths):
    for path in paths:
        cur, ok = item, True
        for part in path.split("."):
            if isinstance(cur, dict) and part in cur:
                cur = cur[part]
            else:
                ok = False; break
        if ok and cur not in (None, "", [], {}):
            return cur
    return None


def _num(v):
    if v is None:
        return None
    if isinstance(v, dict):
        v = v.get("raw", v.get("value"))
    if isinstance(v, (int, float)):
        return int(v)
    m = re.findall(r"\d+", str(v))
    return int("".join(m)) if m else None


def _rooms_area_from_display(item):
    rooms = area = None
    da = item.get("displayAttributes") or {}
    for dp in (da.get("dataPoints") or []):
        txt = ((dp.get("value") or {}).get("plainText") or "") + " " + (dp.get("screenReaderLabel") or "")
        txt = txt.replace("\xa0", " ")
        if area is None and re.search(r"m²|kvm|kvadratmeter", txt):
            m = re.search(r"([\d.,]+)\s*(?:m²|kvm|kvadrat)", txt)
            if m:
                area = float(m.group(1).replace(",", "."))
        if rooms is None and "rum" in txt:
            m = re.search(r"([\d.,]+)\s*rum", txt)
            if m:
                rooms = float(m.group(1).replace(",", "."))
    return rooms, area


def _image_ids(item):
    out = []
    for im in (item.get("images") or []):
        if isinstance(im, dict) and im.get("id"):
            out.append(str(im["id"]))
    pi = item.get("primaryImage")
    if isinstance(pi, dict) and pi.get("id") and str(pi["id"]) not in out:
        out.insert(0, str(pi["id"]))
    return out


def _image_urls(item):
    return [IMG_CDN.format(id=i) for i in _image_ids(item)]


def _listing_id(item):
    lid = _pick(item, "booliId", "id")
    if lid:
        return str(lid)
    u = _pick(item, "url") or json.dumps(item, sort_keys=True)
    return "h" + hashlib.sha1(str(u).encode("utf-8")).hexdigest()[:16]


def to_row(item, status):
    lid = _listing_id(item)
    rooms, area = _rooms_area_from_display(item)
    imgs = _image_ids(item)
    url = _pick(item, "url")
    if url and url.startswith("/"):
        url = BASE + url
    return {
        "id": lid, "status": status, "url": url,
        "address": _pick(item, "streetAddress"),
        "area_name": _pick(item, "descriptiveAreaName"),
        "object_type": _pick(item, "objectType"),
        "tenure": _pick(item, "tenureForm"),
        "construction_year": _num(_pick(item, "constructionYear")),
        "rooms": _pick(item, "rooms") or rooms,
        "living_area_m2": _num(_pick(item, "livingArea")) or area,
        "floor": _pick(item, "floor"),
        "list_price": _num(_pick(item, "listPrice")),
        "sold_price": _num(_pick(item, "soldPrice")),
        "sold_date": _pick(item, "soldDate", "soldSoldDate", "datesold"),
        "monthly_fee": _num(_pick(item, "rent", "monthlyPayment")),
        "sqm_price": _num(_pick(item, "listSqmPrice", "soldSqmPrice", "sqmPrice")),
        "energy_class": _pick(item, "energyClass"),
        "agency_name": _pick(item, "agency.name"),
        "developer": _pick(item, "developer.name", "developer"),
        "association": _pick(item, "brf.name", "housingCooperative", "association"),
        "latitude": _pick(item, "latitude"),
        "longitude": _pick(item, "longitude"),
        "is_new_construction": 1 if _pick(item, "isNewConstruction") else 0,
        "n_images": len(imgs),
        "primary_image": (IMG_CDN.format(id=imgs[0]) if imgs else None),
        "raw_json": json.dumps(item, ensure_ascii=False),
    }


def upsert_listing(conn, item, now, status) -> bool:
    row = to_row(item, status)
    lid = row["id"]
    exists = conn.execute("SELECT 1 FROM listings WHERE id=?", (lid,)).fetchone() is not None
    cols = list(row.keys())
    if exists:
        conn.execute(f"UPDATE listings SET {', '.join(f'{c}=?' for c in cols)}, last_seen=? WHERE id=?",
                     [row[c] for c in cols] + [now, lid])
    else:
        allc = cols + ["first_seen", "last_seen"]
        conn.execute(f"INSERT INTO listings ({','.join(allc)}) VALUES ({','.join('?'*len(allc))})",
                     [row[c] for c in cols] + [now, now])
    _commit_with_retry(conn)
    return not exists


def download_images(item):
    lid = _listing_id(item)
    urls = _image_urls(item)
    if not urls:
        return 0
    d = IMG_DIR / lid
    d.mkdir(parents=True, exist_ok=True)
    got = 0
    for i, url in enumerate(urls):
        dst = d / f"{i}.webp"
        if dst.exists():
            got += 1; continue
        try:
            req = urllib.request.Request(url, headers={"User-Agent": HEADERS["User-Agent"]})
            with urllib.request.urlopen(req, timeout=30) as r:
                dst.write_bytes(r.read())
            got += 1
        except Exception as e:  # noqa: BLE001
            print(f"    [img] {url}: {e}")
    return got


# ── scraping ──────────────────────────────────────────────────────────────────
def scrape(session, area, status, max_items, max_pages, delay):
    path = STATUS_PATH[status]
    out = []
    for page in range(1, max_pages + 1):
        url = f"{BASE}/sok/{path}?areaIds={area}&page={page}"
        html = _fetch(session, url)
        apollo = _next_data(html)["props"]["pageProps"].get("__APOLLO_STATE__", {})
        ents = [_resolve(apollo, v) for k, v in apollo.items()
                if (k.startswith("Listing:") or k.startswith("SoldProperty:")) and isinstance(v, dict)]
        if not ents:
            break
        out.extend(ents)
        print(f"    {status} area {area} page {page}: +{len(ents)} (total {len(out)})")
        if len(out) >= max_items:
            break
        time.sleep(delay)
    return out[:max_items]


def main() -> int:
    args = sys.argv[1:]
    env = _load_env()
    delay = float(env.get("BOOLI_DELAY", "1.5") or "1.5")
    max_items = int(env.get("BOOLI_MAX_ITEMS", "200") or "200")
    max_pages = int(env.get("BOOLI_MAX_PAGES", "20") or "20")
    statuses = [s.strip() for s in env.get("BOOLI_STATUSES", "for_sale,sold,upcoming").split(",") if s.strip()]
    session = requests.Session(); session.headers.update(HEADERS)

    if "--sample" in args:
        if not DB_PATH.exists():
            print("No DB yet — scrape first."); return 1
        c = _connect(DB_PATH)
        r = c.execute("SELECT raw_json FROM listings LIMIT 1").fetchone(); c.close()
        if not r:
            print("DB empty."); return 1
        print(sorted(json.loads(r[0]).keys())); return 0

    if "--test" in args:                       # fetch+parse one area's for-sale page, no DB
        area = args[args.index("--test") + 1] if len(args) > args.index("--test") + 1 else "1"
        ents = scrape(session, area, "for_sale", 5, 1, delay)
        print(f"\nParsed {len(ents)} listings for area {area}:")
        for e in ents[:5]:
            row = to_row(e, "for_sale")
            print(f"  {row['address']} | {row['area_name']} | {row['object_type']} | "
                  f"{row['tenure']} | price {row['list_price']} | {row['rooms']}rum "
                  f"{row['living_area_m2']}m² | {row['n_images']} imgs | agency {row['agency_name']}")
        return 0

    area_ids = [a.strip() for a in env.get("BOOLI_AREA_IDS", "").split(",") if a.strip()]
    if not area_ids:
        print("ERROR: set BOOLI_AREA_IDS in .env (search booli.se and copy areaIds= "
              "from the URL). Or use --test <areaId> to validate parsing.")
        return 1

    conn = init_db()
    now = datetime.now(timezone.utc).isoformat()
    total = new = imgs = 0
    for area in area_ids:
        for status in statuses:
            print(f"\n=== area {area} · {status} ===")
            try:
                ents = scrape(session, area, status, max_items, max_pages, delay)
            except Exception as e:  # noqa: BLE001 — one area/status failing shouldn't kill the rest
                print(f"    [failed] {e}")
                continue
            total += len(ents)
            for it in ents:
                try:
                    if upsert_listing(conn, it, now, status):
                        new += 1
                    imgs += download_images(it)
                except Exception as e:  # noqa: BLE001
                    print(f"    [skip] {e}")
    conn.close()
    print(f"\nDone: {total} listings ({new} new), {imgs} images in {IMG_DIR}/")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
