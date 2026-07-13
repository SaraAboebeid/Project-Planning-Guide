"""
ingest_epc.py - client for the official EPC open-data service.

  https://get-energy-performance-data.communities.gov.uk

This replaced epc.opendatacommunities.org, which was retired on 30 May 2026.
Note that gov.uk/find-energy-certificate is a per-property lookup UI, not a bulk
source - it is not scraped here, and should not be.

Access needs a bearer token: sign in to the service with GOV.UK One Login and copy
the token from your account page. Then either export it:

    export UK_EPC_API_TOKEN=...          # bash
    $env:UK_EPC_API_TOKEN = "..."        # PowerShell

or drop it in a .env file at the repo root as UK_EPC_API_TOKEN=...

Without a token the certificate lookups return nothing and the buildings pipeline
falls back to English Housing Survey band priors (see ingest_ehs.py).

Usage:
    python tools/uk/ingest_epc.py --postcodes NG1 5FS, NG1 6AA
    python tools/uk/ingest_epc.py --city nottingham
    python tools/uk/ingest_epc.py --csv path/to/certificates.csv --city nottingham
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import re
import sys
import time
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))
import cities as uk_cities

ROOT = Path(__file__).resolve().parents[2]
RAW_DIR = ROOT / "data" / "uk_raw"
CACHE_DIR = RAW_DIR / "epc_cache"

BASE_URL = "https://api.get-energy-performance-data.communities.gov.uk"
SEARCH_DOMESTIC = f"{BASE_URL}/api/domestic/search"

# The service throttles at 6000 requests / 5 minutes per IP and answers 429 when
# exceeded. One request per postcode keeps us far below that, but back off anyway.
RATE_LIMIT_SLEEP = 0.12
MAX_RETRIES = 4

TOKEN_ENV = "UK_EPC_API_TOKEN"

BANDS = ["A", "B", "C", "D", "E", "F", "G"]


def _token() -> str | None:
    tok = os.environ.get(TOKEN_ENV, "").strip()
    if tok:
        return tok
    env_file = ROOT / ".env"
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            if line.strip().startswith(f"{TOKEN_ENV}="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    return None


def have_token() -> bool:
    return bool(_token())


def norm_postcode(pc: str) -> str:
    """'ng1  5fs' -> 'NG1 5FS'. UK postcodes always split 'outward inward(3)'."""
    s = re.sub(r"\s+", "", str(pc or "")).upper()
    if len(s) < 5:
        return s
    return f"{s[:-3]} {s[-3:]}"


def norm_house(v) -> str:
    """Normalise a house number/name for joining ('Flat 2, 14A' -> '14A')."""
    s = str(v or "").upper().strip()
    m = re.search(r"\b(\d+[A-Z]?)\b", s)
    return m.group(1) if m else s


def _band(v) -> str | None:
    b = str(v or "").strip().upper()
    return b if b in BANDS else None


def _num(v):
    try:
        f = float(str(v).strip())
        return f if f == f else None
    except (TypeError, ValueError):
        return None


# The API returns snake_case fields; the bulk CSV uses the same names. Keep only
# what the viewer and the data explorer actually show.
def _row(rec: dict) -> dict:
    return {
        "lmk_key": rec.get("lmk-key") or rec.get("lmk_key"),
        "uprn": str(rec.get("uprn") or "").strip() or None,
        "postcode": norm_postcode(rec.get("postcode")),
        "address": ", ".join(
            p for p in [rec.get("address1"), rec.get("address2"), rec.get("address3")] if p
        )
        or rec.get("address"),
        "house": norm_house(rec.get("address1") or rec.get("address")),
        "band": _band(rec.get("current-energy-rating") or rec.get("current_energy_rating")),
        "band_potential": _band(
            rec.get("potential-energy-rating") or rec.get("potential_energy_rating")
        ),
        "sap": _num(rec.get("current-energy-efficiency") or rec.get("current_energy_efficiency")),
        "sap_potential": _num(
            rec.get("potential-energy-efficiency") or rec.get("potential_energy_efficiency")
        ),
        "property_type": rec.get("property-type") or rec.get("property_type"),
        "built_form": rec.get("built-form") or rec.get("built_form"),
        "age_band": rec.get("construction-age-band") or rec.get("construction_age_band"),
        "floor_area_m2": _num(
            rec.get("total-floor-area") or rec.get("total_floor_area")
        ),
        "co2_t_per_yr": _num(
            rec.get("co2-emissions-current") or rec.get("co2_emissions_current")
        ),
        "inspection_date": rec.get("inspection-date") or rec.get("inspection_date"),
    }


def fetch_postcode(postcode: str, token: str, session: requests.Session) -> list[dict]:
    """All domestic certificates for one postcode. Cached on disk."""
    pc = norm_postcode(postcode)
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache = CACHE_DIR / f"{pc.replace(' ', '_')}.json"
    if cache.exists():
        return json.loads(cache.read_text(encoding="utf-8"))

    headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}
    for attempt in range(MAX_RETRIES):
        r = session.get(
            SEARCH_DOMESTIC, params={"postcode": pc}, headers=headers, timeout=45
        )
        if r.status_code == 429:
            wait = 2 ** attempt * 5
            print(f"    rate limited on {pc}; backing off {wait}s")
            time.sleep(wait)
            continue
        if r.status_code in (401, 403):
            raise SystemExit(
                f"EPC API rejected the token ({r.status_code}). Check {TOKEN_ENV}; "
                "get a bearer token from your account page at "
                "https://get-energy-performance-data.communities.gov.uk"
            )
        if r.status_code == 404:
            rows = []
            break
        r.raise_for_status()
        payload = r.json()
        # The service wraps results; tolerate either shape.
        raw = payload.get("rows") or payload.get("data") or payload.get("results") or []
        if isinstance(raw, dict):
            raw = raw.get("rows") or []
        rows = [_row(x) for x in raw]
        break
    else:
        raise SystemExit(f"EPC API kept rate limiting on {pc}; try again later")

    cache.write_text(json.dumps(rows), encoding="utf-8")
    time.sleep(RATE_LIMIT_SLEEP)
    return rows


def fetch_postcodes(postcodes) -> list[dict]:
    """Certificates for many postcodes. Returns [] (with a warning) if no token."""
    token = _token()
    pcs = sorted({norm_postcode(p) for p in postcodes if p})
    if not token:
        print(
            f"  no {TOKEN_ENV} set - skipping {len(pcs)} EPC postcode lookups.\n"
            "  Buildings will fall back to English Housing Survey band priors.\n"
            "  To use real certificates, get a bearer token from\n"
            "  https://get-energy-performance-data.communities.gov.uk (GOV.UK One Login)."
        )
        return []

    out: list[dict] = []
    session = requests.Session()
    for i, pc in enumerate(pcs, 1):
        rows = fetch_postcode(pc, token, session)
        out.extend(rows)
        if i % 25 == 0 or i == len(pcs):
            print(f"    EPC {i}/{len(pcs)} postcodes, {len(out):,} certificates")
    return out


def load_csv(path: Path, postcodes=None) -> list[dict]:
    """
    Read the bulk download instead of the API.

    The national file is ~5.6 GB, so stream it and keep only the postcodes we
    need rather than loading it into memory.
    """
    want = {norm_postcode(p) for p in postcodes} if postcodes else None
    out = []
    with open(path, newline="", encoding="utf-8-sig", errors="replace") as f:
        for rec in csv.DictReader(f):
            if want and norm_postcode(rec.get("postcode")) not in want:
                continue
            out.append(_row(rec))
    print(f"  read {len(out):,} certificates from {path.name}")
    return out


def index_by_address(rows) -> dict:
    """
    Key certificates for joining against OSM building tags.

    A building carries one address but may hold many certificates (a block of
    flats). Keep them all under (postcode, house) and let the caller aggregate.
    """
    idx: dict[tuple, list] = {}
    for r in rows:
        if not r.get("postcode"):
            continue
        idx.setdefault((r["postcode"], r["house"]), []).append(r)
        if r.get("uprn"):
            idx.setdefault(("UPRN", r["uprn"]), []).append(r)
    return idx


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--city", help=f"one of: {', '.join(c['id'] for c in uk_cities.CITIES)}")
    ap.add_argument("--postcodes", help="comma-separated postcodes")
    ap.add_argument("--csv", type=Path, help="bulk certificates.csv instead of the API")
    ap.add_argument("--out", type=Path, help="write the certificates to this JSON file")
    args = ap.parse_args()

    postcodes = []
    if args.postcodes:
        postcodes = [p.strip() for p in args.postcodes.split(",") if p.strip()]
    elif args.city:
        # Postcodes come from the OSM footprints, so this path needs the pipeline
        # to have run once already.
        cache = RAW_DIR / f"osm_{args.city}.json"
        if not cache.exists():
            raise SystemExit(
                f"{cache} not found - run 'python tools/uk/uk_data_pipeline.py "
                f"--city {args.city}' first to collect the postcodes."
            )
        feats = json.loads(cache.read_text(encoding="utf-8")).get("elements", [])
        postcodes = {
            (e.get("tags") or {}).get("addr:postcode") for e in feats
        }
        postcodes = [p for p in postcodes if p]
        print(f"  {len(postcodes)} distinct postcodes in the {args.city} focus area")

    if not postcodes and not args.csv:
        raise SystemExit("give --postcodes, --city, or --csv")

    rows = load_csv(args.csv, postcodes) if args.csv else fetch_postcodes(postcodes)
    print(f"\n{len(rows):,} certificates")
    if rows:
        from collections import Counter

        dist = Counter(r["band"] for r in rows if r["band"])
        print("  band distribution:", dict(sorted(dist.items())))

    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(json.dumps(rows, indent=1), encoding="utf-8")
        print(f"  wrote {args.out}")


if __name__ == "__main__":
    main()
