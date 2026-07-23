"""
geocode_epc.py — cached forward-geocoder for Gothenburg EPC addresses that the
attribute/geometry matching in data_pipeline.py cannot place.

WHY: ~15% of unlinked Gothenburg EPCs have a cadastral that appears on NO
Lantmäteriet footprint (not even at block level), so the pipeline has no
coordinate to attach them to. Those addresses are geocoded here (street + house
number + postcode → lon/lat) and cached, so the pipeline can spatially attach
them to the nearest building.

Design:
  • Cache is a JSON file (data/epc_geocode_cache.json) keyed by the exact EPC
    IdAdr string. Resumable — a re-run only geocodes what isn't cached yet, so
    the (rate-limited) run can be stopped and restarted freely.
  • Nominatim public API, 1 request/sec (their usage policy), structured query.
  • A cached value is [lon, lat] on success or null on a confirmed no-result, so
    failures aren't retried forever.

Usage:
    python tools/se/geocode_epc.py            # geocode all still-uncached
    python tools/se/geocode_epc.py --limit 50 # a small batch (testing)
"""

import argparse
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

import duckdb

DB_PATH = "data/sensitivity/epc_sweden.duckdb"
CACHE_PATH = Path("data/epc_geocode_cache.json")
NOMINATIM = "https://nominatim.openstreetmap.org/search"
USER_AGENT = "PPG-Gothenburg-EPC-matcher/1.0 (research; contact saraabo@chalmers.se)"
SLEEP_S = 1.1  # >= 1 req/s per Nominatim usage policy


def addresses_needing_geocode(con) -> list[dict]:
    """Distinct Göteborg EPC addresses (with energy) that are NOT FormularId-linked
    and whose EXACT cadastral has no footprint. The pipeline places the rest from
    the exact-cadastral footprint centroid; block-centroid was measured at ~266 m
    median error, so block-only addresses are geocoded here instead."""
    rows = con.execute(
        """
        WITH linked AS (SELECT DISTINCT FormularId FROM footprints WHERE FormularId IS NOT NULL),
             fp_cad AS (SELECT DISTINCT upper(fastighetsbeteckning) cad
                        FROM footprints WHERE fastighetsbeteckning IS NOT NULL AND TRIM(fastighetsbeteckning)<>'')
        SELECT DISTINCT TRIM("IdAdr") AS addr, MIN("IdPostnr") AS postnr, MIN("IdPostort") AS ort
        FROM epc
        WHERE IdKommun='Göteborg' AND EgiSpecifikEnergianvandning IS NOT NULL
          AND IdAdr IS NOT NULL AND TRIM(IdAdr)<>''
          AND FormularId NOT IN (SELECT FormularId FROM linked)
          AND upper(TRIM("IdFastBet")) NOT IN (SELECT cad FROM fp_cad)
        GROUP BY TRIM("IdAdr")
        """
    ).fetchall()
    return [{"addr": r[0], "postnr": r[1], "ort": r[2]} for r in rows]


def load_cache() -> dict:
    if CACHE_PATH.exists():
        try:
            return json.loads(CACHE_PATH.read_text(encoding="utf-8"))
        except Exception:
            return {}
    return {}


def save_cache(cache: dict) -> None:
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = CACHE_PATH.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
    tmp.replace(CACHE_PATH)


class RateLimited(Exception):
    """Nominatim 429 / transport error — the caller must retry, NOT cache a null."""


def _query(params: dict):
    """One Nominatim request. Returns the parsed list on HTTP 200 (possibly empty),
    or raises RateLimited on 429 / 5xx / network error so the address is retried
    instead of being permanently cached as a failure."""
    params = {**params, "format": "json", "limit": "1"}
    url = NOMINATIM + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=25) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        if e.code in (429, 500, 502, 503, 504):
            raise RateLimited(str(e.code))
        return []          # 4xx other than 429 → treat as a genuine no-result
    except Exception as e:
        raise RateLimited(str(e))


def geocode_one(addr: str, postnr, ort):
    """Return [lon, lat], or None for a confirmed no-result. Retries transient
    errors (429/timeout) with exponential backoff so they never cache as null."""
    postal = re.sub(r"\s+", "", str(postnr)) if postnr else None
    attempts = [
        {"street": addr, "city": "Göteborg", "country": "Sweden",
         **({"postalcode": postal} if postal else {})},
        {"q": f"{addr}, {ort or 'Göteborg'}, Sweden"},
    ]
    for params in attempts:
        backoff = 5.0
        for _try in range(6):
            try:
                data = _query(params)
            except RateLimited:
                time.sleep(backoff)
                backoff = min(backoff * 2, 120)
                continue
            time.sleep(SLEEP_S)
            if data:
                return [round(float(data[0]["lon"]), 6), round(float(data[0]["lat"]), 6)]
            break          # HTTP 200 but empty → this query form found nothing; try the next form
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0, help="max NEW geocodes this run (0 = all)")
    args = ap.parse_args()

    con = duckdb.connect(DB_PATH, read_only=True)
    todo = addresses_needing_geocode(con)
    con.close()

    cache = load_cache()
    pending = [a for a in todo if a["addr"] not in cache]
    print(f"{len(todo)} addresses need geocoding · {len(cache)} cached · {len(pending)} pending", flush=True)
    if args.limit:
        pending = pending[: args.limit]
        print(f"  (limited to {len(pending)} this run)", flush=True)

    done = 0
    for a in pending:
        cache[a["addr"]] = geocode_one(a["addr"], a["postnr"], a["ort"])
        done += 1
        if done % 25 == 0:
            save_cache(cache)
            hit = sum(1 for v in cache.values() if v)
            print(f"  {done}/{len(pending)} · cache={len(cache)} · geocoded_ok={hit}", flush=True)

    save_cache(cache)
    hit = sum(1 for v in cache.values() if v)
    print(f"DONE · cached={len(cache)} · geocoded_ok={hit} · failed={len(cache)-hit}", flush=True)


if __name__ == "__main__":
    main()
