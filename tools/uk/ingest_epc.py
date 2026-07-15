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

Endpoint contract (verified against the authoritative spec, not scraped doc prose):
  https://github.com/communitiesuk/epb-data-warehouse/blob/main/api/api.yml
  GET /api/domestic/search?postcode=...&current_page=1&page_size=5000
  -> {"data": [{addressLine1..4, uprn, certificateNumber, constituency, council,
                currentEnergyEfficiencyBand, postTown, postcode, registrationDate,
                schemaType}], "pagination": {totalPages, nextPage, ...}}

Search results carry the band but NOT floor area / property type / age band / SAP
score - those only exist on the full certificate document, fetched separately via
GET /api/certificate?certificate_number=... (schema is `additionalProperties: true`
in the spec, i.e. not fixed - fetch_certificate_detail() below tries the standard
EPC register column names but has not been verified against a live response, since
building this required no token).

The full certificate document also carries HVAC/low-carbon-tech fields, using the
same standard column names as the bulk CSV export (main_fuel, mainheat_description,
mainheat_energy_eff, secondheat_description, hotwater_description/energy_eff,
mains_gas_flag, solar_water_heating_flag, photo_supply_pct) plus two derived flags
(has_heat_pump, has_solar_pv) read off the free-text heating description, since the
register has no single "has a heat pump" column. These are only populated when
fetch_postcodes(..., with_details=True) makes the extra per-certificate call - see
uk_data_pipeline.py's --epc-details flag.

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

# The docs advertise 6000 requests / 5 minutes per IP, but in practice a much
# tighter burst limit kicks in well before that (observed 429s after ~25-175
# requests even at a 0.5s pace, and it doesn't clear within a couple of minutes
# of backoff - this looks like a short rolling window, not the advertised one).
RATE_LIMIT_SLEEP = 2.0
MAX_RETRIES = 8

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
    # OSM's ";"-joined multi-value tags occasionally leak in here; take the
    # first value rather than send the API a garbled combined string.
    raw = str(pc or "").split(";")[0]
    s = re.sub(r"\s+", "", raw).upper()
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


def _flag(v) -> bool | None:
    """EPC Y/N-style fields ('Y', 'N', 'Yes', 'No', true/false) -> bool, or
    None if genuinely absent (not the same as a confirmed 'No')."""
    s = str(v if v is not None else "").strip().upper()
    if s in ("Y", "YES", "TRUE", "1"):
        return True
    if s in ("N", "NO", "FALSE", "0"):
        return False
    return None


# No single EPC column flags "has a heat pump" - it has to be read off the
# free-text heating description (e.g. "Air source heat pump, radiators, electric").
# Covers air/ground/water source heat pumps; a false negative just means the
# text didn't use the phrase "heat pump", not that detection is unreliable.
def _has_heat_pump(mainheat_description) -> bool | None:
    if not mainheat_description:
        return None
    return "heat pump" in str(mainheat_description).lower()


def _has_solar_pv(photo_supply_pct, mainheat_description=None) -> bool | None:
    if photo_supply_pct is not None:
        return photo_supply_pct > 0
    text = str(mainheat_description or "").lower()
    if "photovoltaic" in text or "solar pv" in text:
        return True
    return None


# GET /api/domestic/search returns EnergyCertificateSearchResult objects - band and
# identity fields only, in camelCase. See the module docstring for where the
# fuller fields (floor area, property type, age band, SAP score) actually live.
def _row(rec: dict) -> dict:
    address_lines = [rec.get(f"addressLine{i}") for i in range(1, 5)]
    return {
        "certificate_number": rec.get("certificateNumber"),
        "uprn": str(rec.get("uprn") or "").strip() or None,
        "postcode": norm_postcode(rec.get("postcode")),
        "address": ", ".join(p for p in address_lines if p),
        "house": norm_house(address_lines[0]),
        "band": _band(rec.get("currentEnergyEfficiencyBand")),
        "council": rec.get("council"),
        "constituency": rec.get("constituency"),
        "post_town": rec.get("postTown"),
        "registration_date": rec.get("registrationDate"),
        # Populated only if fetch_certificate_detail() was called for this row.
        "band_potential": None,
        "sap": None,
        "sap_potential": None,
        "property_type": None,
        "built_form": None,
        "age_band": None,
        "floor_area_m2": None,
        "co2_t_per_yr": None,
        "inspection_date": None,
        "energy_consumption_kwh_m2_yr": None,
        "main_fuel": None,
        "mainheat_description": None,
        "mainheat_energy_eff": None,
        "secondheat_description": None,
        "hotwater_description": None,
        "hotwater_energy_eff": None,
        "mains_gas_flag": None,
        "solar_water_heating_flag": None,
        "photo_supply_pct": None,
        "has_heat_pump": None,
        "has_solar_pv": None,
    }


# The bulk CSV export uses the classic EPC register column names (lowercase,
# hyphenated), a different convention from the JSON API - and unlike the search
# API, the bulk file carries every field on one row. NOTE: unlike
# fetch_certificate_detail() below (verified against a live response), these
# column-name assumptions are the well-documented historical bulk-CSV schema
# but have not themselves been checked against a real downloaded file.
def _row_from_csv(rec: dict) -> dict:
    mainheat_description = rec.get("mainheat-description")
    photo_supply_pct = _num(rec.get("photo-supply"))
    return {
        "certificate_number": rec.get("lmk-key"),
        "uprn": str(rec.get("uprn") or "").strip() or None,
        "postcode": norm_postcode(rec.get("postcode")),
        "address": ", ".join(
            p for p in [rec.get("address1"), rec.get("address2"), rec.get("address3")] if p
        )
        or rec.get("address"),
        "house": norm_house(rec.get("address1") or rec.get("address")),
        "band": _band(rec.get("current-energy-rating")),
        "band_potential": _band(rec.get("potential-energy-rating")),
        "sap": _num(rec.get("current-energy-efficiency")),
        "sap_potential": _num(rec.get("potential-energy-efficiency")),
        "property_type": rec.get("property-type"),
        "built_form": rec.get("built-form"),
        "age_band": rec.get("construction-age-band"),
        "floor_area_m2": _num(rec.get("total-floor-area")),
        "co2_t_per_yr": _num(rec.get("co2-emissions-current")),
        "inspection_date": rec.get("inspection-date"),
        "energy_consumption_kwh_m2_yr": _num(rec.get("energy-consumption-current")),
        "main_fuel": rec.get("main-fuel"),
        "mainheat_description": mainheat_description,
        "mainheat_energy_eff": rec.get("mainheat-energy-eff"),
        "secondheat_description": rec.get("secondheat-description"),
        "hotwater_description": rec.get("hotwater-description"),
        "hotwater_energy_eff": rec.get("hotwater-energy-eff"),
        "mains_gas_flag": _flag(rec.get("mains-gas-flag")),
        "solar_water_heating_flag": _flag(rec.get("solar-water-heating-flag")),
        "photo_supply_pct": photo_supply_pct,
        "has_heat_pump": _has_heat_pump(mainheat_description),
        "has_solar_pv": _has_solar_pv(photo_supply_pct, mainheat_description),
        "council": None,
        "constituency": None,
        "post_town": None,
        "registration_date": None,
    }


def _desc_and_rating(value):
    """main_heating/secondary_heating/hot_water/main_heating_controls are
    each either a single {description, energy_efficiency_rating, ...} object
    or a list of them (RdSAP allows more than one heating system) - verified
    against a live response (schema RdSAP-Schema-21.0.1). Returns the first
    entry's (description, energy_efficiency_rating), or (None, None)."""
    if isinstance(value, list):
        value = value[0] if value else None
    if isinstance(value, dict):
        return value.get("description"), value.get("energy_efficiency_rating")
    return None, None


def _scalar(v):
    """Coerce a field that's documented/observed as a plain string to one -
    seen live: at least one real certificate returns a nested dict for
    `dwelling_type` instead of the plain string ("Ground-floor maisonette")
    the single sample response this module was built against. Rather than
    guess at that alternate shape, just drop it to None so a downstream
    Counter()-based aggregation never crashes on an unhashable value."""
    return v if isinstance(v, (str, int, float)) else None


def _find_pv_percent(photovoltaic_supply):
    """sap_energy_source.photovoltaic_supply is a tagged-union-style nested
    dict - a live no-PV response looks like
    {"none_or_no_details": {"percent_roof_area": 0}}. The "has PV" sibling
    key hasn't been observed live, so search generically for whichever
    sub-dict carries percent_roof_area rather than hardcoding a key name."""
    if not isinstance(photovoltaic_supply, dict):
        return None
    for v in photovoltaic_supply.values():
        if isinstance(v, dict) and "percent_roof_area" in v:
            return _num(v["percent_roof_area"])
    return None


def fetch_certificate_detail(certificate_number: str, token: str, session: requests.Session) -> dict:
    """
    GET /api/certificate?certificate_number=... - the full RdSAP calculation
    document, for fields the search endpoint doesn't carry (floor area,
    property type, age band, SAP score, HVAC/low-carbon-tech details).

    Schema verified against a live response (schema_type "RdSAP-Schema-21.0.1"):
    it is NOT the flat kebab-case bulk-CSV schema _row_from_csv() uses below -
    heating/hot-water/window/etc are nested {description, energy_efficiency_rating,
    environmental_efficiency_rating} objects (main_heating/main_heating_controls
    are lists of these, secondary_heating/hot_water are single objects),
    `property_type` is a numeric SAP code with no confirmed decode table (use
    the free-text `dwelling_type` instead, e.g. "Ground-floor maisonette"),
    `built_form` is also a raw SAP code (e.g. "NR") passed through undecoded,
    and `construction_age_band` lives per-building-part under
    sap_building_parts, not at the top level.
    """
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}
    r = None
    for attempt in range(3):
        try:
            r = session.get(
                f"{BASE_URL}/api/certificate",
                params={"certificate_number": certificate_number},
                headers=headers,
                timeout=30,
            )
            break
        except (requests.exceptions.ConnectionError, requests.exceptions.Timeout) as exc:
            # Seen live: the server occasionally drops the connection mid-response
            # during a long run of N+1 detail fetches - a transient blip, not a
            # real failure, so a short retry is worth it rather than losing the
            # whole (multi-minute) batch to one flaky request.
            if attempt == 2:
                print(f"    detail fetch for {certificate_number} failed after 3 attempts: {exc}")
                return {}
            wait = 2 ** attempt * 3
            print(f"    detail fetch for {certificate_number} dropped ({exc.__class__.__name__}); retrying in {wait}s")
            time.sleep(wait)
    if r is None or r.status_code != 200:
        return {}
    doc = (r.json() or {}).get("data") or {}

    building_parts = doc.get("sap_building_parts") or []
    age_band = building_parts[0].get("construction_age_band") if building_parts else None

    mainheat_description, mainheat_energy_eff = _desc_and_rating(doc.get("main_heating"))
    secondheat_description, _ = _desc_and_rating(doc.get("secondary_heating"))
    hotwater_description, hotwater_energy_eff = _desc_and_rating(doc.get("hot_water"))

    energy_source = doc.get("sap_energy_source") or {}
    photo_supply_pct = _find_pv_percent(energy_source.get("photovoltaic_supply"))

    return {
        "band_potential": _band(doc.get("potential_energy_efficiency_band")),
        "sap": _num(doc.get("energy_rating_current")),
        "sap_potential": _num(doc.get("energy_rating_potential")),
        "property_type": _scalar(doc.get("dwelling_type")),
        "built_form": _scalar(doc.get("built_form")),
        "age_band": age_band,
        "floor_area_m2": _num(doc.get("total_floor_area")),
        "co2_t_per_yr": _num(doc.get("co2_emissions_current")),
        "inspection_date": doc.get("inspection_date"),
        "energy_consumption_kwh_m2_yr": _num(doc.get("energy_consumption_current")),
        "main_fuel": None,  # no confirmed decode table for sap_heating's numeric fuel codes; see mainheat_description
        "mainheat_description": mainheat_description,
        "mainheat_energy_eff": mainheat_energy_eff,
        "secondheat_description": secondheat_description,
        "hotwater_description": hotwater_description,
        "hotwater_energy_eff": hotwater_energy_eff,
        "mains_gas_flag": _flag(energy_source.get("mains_gas")),
        "solar_water_heating_flag": _flag(doc.get("solar_water_heating")),
        "photo_supply_pct": photo_supply_pct,
        "has_heat_pump": _has_heat_pump(mainheat_description),
        "has_solar_pv": _has_solar_pv(photo_supply_pct, mainheat_description),
    }


def fetch_postcode(postcode: str, token: str, session: requests.Session) -> list[dict]:
    """All domestic certificates for one postcode. Cached on disk."""
    pc = norm_postcode(postcode)
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache = CACHE_DIR / f"{pc.replace(' ', '_')}.json"
    if cache.exists():
        return json.loads(cache.read_text(encoding="utf-8"))

    headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}
    rows: list[dict] = []
    page = 1
    while True:
        for attempt in range(MAX_RETRIES):
            try:
                r = session.get(
                    SEARCH_DOMESTIC,
                    params={"postcode": pc, "current_page": page, "page_size": 5000},
                    headers=headers,
                    timeout=45,
                )
            except (requests.exceptions.ConnectionError, requests.exceptions.Timeout) as exc:
                # Same transient mid-response drop seen on the detail endpoint.
                wait = min(2 ** attempt * 3, 30)
                print(f"    {pc} connection dropped ({exc.__class__.__name__}); retrying in {wait}s (attempt {attempt + 1}/{MAX_RETRIES})")
                time.sleep(wait)
                continue
            if r.status_code == 429:
                retry_after = r.headers.get("Retry-After")
                wait = float(retry_after) if retry_after else min(2 ** attempt * 5, 60)
                print(f"    rate limited on {pc}; backing off {wait:.0f}s (attempt {attempt + 1}/{MAX_RETRIES})")
                time.sleep(wait)
                continue
            if r.status_code in (401, 403):
                raise SystemExit(
                    f"EPC API rejected the token ({r.status_code}). Check {TOKEN_ENV}; "
                    "get a bearer token from your account page at "
                    "https://get-energy-performance-data.communities.gov.uk"
                )
            if r.status_code == 404:
                payload = {"data": []}
                break
            if r.status_code == 400 and page > 1:
                # Seen on at least one postcode (E14 6HJ): the API returns a
                # `nextPage` value that itself then 400s - page_size=5000 is far
                # above any real postcode's certificate count anyway, so treat
                # this as "no more pages" rather than losing the whole postcode.
                print(f"    {pc} page {page} rejected (400) - stopping pagination, keeping page(s) already fetched")
                payload = {"data": [], "pagination": {}}
                break
            r.raise_for_status()
            payload = r.json()
            break
        else:
            raise SystemExit(f"EPC API kept rate limiting on {pc}; try again later")

        raw = payload.get("data") or []
        rows.extend(_row(x) for x in raw)
        pagination = payload.get("pagination") or {}
        if not pagination.get("nextPage"):
            break
        page = pagination["nextPage"]
        time.sleep(RATE_LIMIT_SLEEP)

    cache.write_text(json.dumps(rows), encoding="utf-8")
    time.sleep(RATE_LIMIT_SLEEP)
    return rows


def fetch_postcodes(postcodes, with_details: bool = True) -> list[dict]:
    """
    Certificates for many postcodes. Returns [] (with a warning) if no token.

    with_details=True makes one extra GET /api/certificate call per matched
    certificate to fill in floor area / property type / age band / SAP score,
    which the search endpoint doesn't carry. That's an N+1 pattern - fine at
    city-district scale (a few thousand certificates), but set False to skip
    it if you only need the band.
    """
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

    if with_details and out:
        print(f"    fetching full details for {len(out):,} certificates ...")
        for i, row in enumerate(out, 1):
            if not row.get("certificate_number"):
                continue
            row.update(fetch_certificate_detail(row["certificate_number"], token, session))
            time.sleep(RATE_LIMIT_SLEEP)
            if i % 100 == 0 or i == len(out):
                print(f"      {i}/{len(out)}")

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
            out.append(_row_from_csv(rec))
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
