"""
uk_data_pipeline.py - build the UK building payloads the 3D viewer extrudes.

For each focus city (London, Birmingham, Nottingham):

  1. pull building footprints from OpenStreetMap via Overpass
  2. join Energy Performance Certificates onto them by postcode + house number
  3. where no certificate matches, fall back to English Housing Survey band priors
  4. emit records in exactly the schema the Gothenburg viewer already renders

Step 4 is the point: because the record shape matches assets/buildings.json, the
existing viewer draws UK buildings with no changes - same legend, same colour
modes, same facade inspector. Only the data source and camera differ.

Usage:
    python tools/uk/uk_data_pipeline.py                  # all cities
    python tools/uk/uk_data_pipeline.py --city london
    python tools/uk/uk_data_pipeline.py --refresh        # ignore the Overpass cache

Outputs:
    frontend/public/uk/buildings_<city>.json    the extrusion payload
    frontend/public/uk/cities.json              city registry + per-city stats
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
import time
from collections import Counter
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))
import cities as uk_cities
import ingest_epc

ROOT = Path(__file__).resolve().parents[2]
RAW_DIR = ROOT / "data" / "uk_raw"
OUT_DIR = ROOT / "frontend" / "public" / "uk"
PRIORS_PATH = OUT_DIR / "epc_band_priors.json"

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
# Overpass answers 406 to requests without an identifying User-Agent.
OVERPASS_HEADERS = {
    "User-Agent": "project-planning-guide/1.0 (retrofit dashboard; contact via repo)",
}

BANDS = ["A", "B", "C", "D", "E", "F", "G"]

# OSM building tag -> the use categories the viewer already colours. Reusing the
# existing keys (rather than inventing UK ones) means USE_COLORS and the legend
# work unchanged; the labels they map to are already generic English.
USE_CAT = {
    "house": "bostad_enfamilj",
    "detached": "bostad_enfamilj",
    "semidetached_house": "bostad_enfamilj",
    "terrace": "bostad_enfamilj",
    "bungalow": "bostad_enfamilj",
    "cottage": "bostad_enfamilj",
    "apartments": "bostad_flerfamilj",
    "residential": "bostad_flerfamilj",
    "flats": "bostad_flerfamilj",
    "dormitory": "bostad_flerfamilj",
    "commercial": "verksamhet",
    "retail": "verksamhet",
    "office": "verksamhet",
    "shop": "verksamhet",
    "supermarket": "verksamhet",
    "hotel": "verksamhet",
    "kiosk": "verksamhet",
    "industrial": "industri",
    "warehouse": "industri",
    "factory": "industri",
    "school": "samhalle",
    "university": "samhalle",
    "college": "samhalle",
    "hospital": "samhalle",
    "church": "samhalle",
    "chapel": "samhalle",
    "cathedral": "samhalle",
    "civic": "samhalle",
    "public": "samhalle",
    "government": "samhalle",
    "train_station": "samhalle",
    "transportation": "samhalle",
    "garage": "komplement",
    "garages": "komplement",
    "shed": "komplement",
    "carport": "komplement",
    "hut": "komplement",
    "roof": "komplement",
    "service": "komplement",
}

# Which EHS "dwelling type" prior to use for a building with no certificate.
EHS_TYPE = {
    "detached": "detached house",
    "house": "semi-detached house",
    "semidetached_house": "semi-detached house",
    "terrace": "medium/large terraced house",
    "bungalow": "bungalow",
    "apartments": "purpose built flat, low rise",
    "residential": "purpose built flat, low rise",
    "flats": "purpose built flat, low rise",
}

# EHS dwelling-age bands, as lower bounds. Shared by the viewer's "year" colour mode.
AGE_BANDS = [
    (0, "pre-1919"),
    (1919, "1919-44"),
    (1945, "1945-64"),
    (1965, "1965-80"),
    (1981, "1981-90"),
    (1991, "1991-2002"),
    (2003, "2003-2013"),
    (2014, "post-2013"),
]

# Storey height when only building:levels is tagged, and fallback heights by use.
LEVEL_HEIGHT_M = 3.0
DEFAULT_HEIGHT = {
    "bostad_enfamilj": 6.0,
    "bostad_flerfamilj": 12.0,
    "verksamhet": 9.0,
    "industri": 8.0,
    "samhalle": 9.0,
    "komplement": 3.0,
    "ovrigt": 6.0,
}


# ---------------------------------------------------------------------------
# OpenStreetMap
# ---------------------------------------------------------------------------
def fetch_osm(city: dict, refresh: bool = False) -> dict:
    cache = RAW_DIR / f"osm_{city['id']}.json"
    if cache.exists() and not refresh:
        print(f"  using cached {cache.name}")
        return json.loads(cache.read_text(encoding="utf-8"))

    query = f"""
[out:json][timeout:240];
(
  way["building"](around:{city['radius_m']},{city['lat']},{city['lon']});
  relation["building"]["type"="multipolygon"](around:{city['radius_m']},{city['lat']},{city['lon']});
);
out geom;
"""
    print(f"  querying Overpass for {city['name']} ({city['radius_m']} m radius) ...")
    for attempt in range(3):
        r = requests.post(
            OVERPASS_URL, data={"data": query}, headers=OVERPASS_HEADERS, timeout=300
        )
        if r.status_code in (429, 504):
            wait = 20 * (attempt + 1)
            print(f"    Overpass busy ({r.status_code}); retrying in {wait}s")
            time.sleep(wait)
            continue
        r.raise_for_status()
        data = r.json()
        break
    else:
        raise SystemExit("Overpass kept refusing; try again later")

    RAW_DIR.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps(data), encoding="utf-8")
    print(f"    {len(data.get('elements', [])):,} elements -> {cache.name}")
    return data


def ring_of(el: dict) -> list | None:
    """Outer ring as [[lon,lat], ...], closed. Handles ways and multipolygons."""
    if el.get("type") == "way":
        geom = el.get("geometry") or []
        ring = [[p["lon"], p["lat"]] for p in geom if "lon" in p and "lat" in p]
    else:
        outer = [
            m for m in (el.get("members") or [])
            if m.get("role") == "outer" and m.get("geometry")
        ]
        if not outer:
            return None
        # Use the longest outer way; stitching every ring of a multipolygon is more
        # fidelity than an extruded block needs.
        best = max(outer, key=lambda m: len(m["geometry"]))
        ring = [[p["lon"], p["lat"]] for p in best["geometry"] if "lon" in p and "lat" in p]

    if len(ring) < 3:
        return None
    if ring[0] != ring[-1]:
        ring.append(ring[0])
    return ring


def footprint_m2(ring: list) -> float:
    """Shoelace area, with longitude scaled by cos(lat) - fine at building scale."""
    lat0 = math.radians(sum(p[1] for p in ring) / len(ring))
    mx = 111_320.0 * math.cos(lat0)
    my = 110_540.0
    a = 0.0
    for i in range(len(ring) - 1):
        x1, y1 = ring[i][0] * mx, ring[i][1] * my
        x2, y2 = ring[i + 1][0] * mx, ring[i + 1][1] * my
        a += x1 * y2 - x2 * y1
    return round(abs(a) / 2.0, 1)


def _f(v):
    try:
        return float(str(v).strip().split()[0])
    except (TypeError, ValueError, IndexError):
        return None


# ---------------------------------------------------------------------------
# EPC + EHS
# ---------------------------------------------------------------------------
def year_to_band(year) -> str | None:
    if not year:
        return None
    band = None
    for lo, name in AGE_BANDS:
        if year >= lo:
            band = name
    return band


def epc_age_to_year(age_band: str | None):
    """
    'England and Wales: 1950-1966' -> 1958.

    EPC construction-age bands are ranges; take the midpoint so the building can be
    bucketed into an EHS band and coloured by the viewer's year mode.
    """
    if not age_band:
        return None
    years = [int(y) for y in __import__("re").findall(r"(1[89]\d{2}|20\d{2})", str(age_band))]
    if not years:
        return None
    if len(years) == 1:
        # "before 1900" / "2012 onwards"
        s = str(age_band).lower()
        if "before" in s:
            return years[0] - 10
        return years[0] + 2
    return (min(years) + max(years)) // 2


def stable_unit(key: str) -> float:
    """Deterministic [0,1) from a building id, so rebuilds are reproducible."""
    h = hashlib.sha256(key.encode()).digest()
    return int.from_bytes(h[:8], "big") / 2**64


def sample_band(prior: dict, key: str) -> str:
    """Draw a band from a prior distribution, deterministically per building."""
    u = stable_unit(key)
    acc = 0.0
    for b in BANDS:
        acc += prior.get(b, 0.0)
        if u < acc:
            return b
    return "D"


def load_priors() -> dict:
    if not PRIORS_PATH.exists():
        raise SystemExit(
            f"{PRIORS_PATH} not found - run 'python tools/uk/ingest_ehs.py' first"
        )
    return json.loads(PRIORS_PATH.read_text(encoding="utf-8"))["priors"]


# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------
def build_city(city: dict, priors: dict, refresh: bool = False) -> dict:
    print(f"\n{city['name']} - {city['district']}")
    osm = fetch_osm(city, refresh=refresh)
    elements = osm.get("elements", [])

    postcodes = {
        (e.get("tags") or {}).get("addr:postcode")
        for e in elements
        if (e.get("tags") or {}).get("addr:postcode")
    }
    print(f"  {len(elements):,} OSM buildings, {len(postcodes)} distinct postcodes")

    certs = ingest_epc.fetch_postcodes(postcodes) if postcodes else []
    epc_idx = ingest_epc.index_by_address(certs)
    if certs:
        print(f"  {len(certs):,} EPC certificates")

    age_prior = priors["dwelling age"]
    type_prior = priors["dwelling type"]
    region_prior = priors["region"].get(city["region"], {}).get("bands", {})

    records, stats = [], Counter()

    for el in elements:
        ring = ring_of(el)
        if not ring:
            continue
        tags = el.get("tags") or {}
        btag = tags.get("building", "yes")
        use_cat = USE_CAT.get(btag, "ovrigt")

        levels = _f(tags.get("building:levels"))
        height = _f(tags.get("height")) or _f(tags.get("building:height"))
        if not height:
            height = levels * LEVEL_HEIGHT_M if levels else DEFAULT_HEIGHT[use_cat]

        postcode = ingest_epc.norm_postcode(tags.get("addr:postcode") or "")
        house = ingest_epc.norm_house(tags.get("addr:housenumber") or "")
        uprn = str(tags.get("ref:GB:uprn") or "").strip()

        matches = []
        if uprn:
            matches = epc_idx.get(("UPRN", uprn), [])
        if not matches and postcode and house:
            matches = epc_idx.get((postcode, house), [])

        osm_id = f"{el.get('type')}/{el.get('id')}"
        rec_year = _f(tags.get("start_date"))

        if matches:
            # A block of flats holds many certificates. Represent the building by the
            # modal band and the mean SAP - one extruded block, one colour.
            bands = [m["band"] for m in matches if m["band"]]
            band = Counter(bands).most_common(1)[0][0] if bands else None
            saps = [m["sap"] for m in matches if m["sap"] is not None]
            sap = round(sum(saps) / len(saps), 1) if saps else None
            ages = [epc_age_to_year(m["age_band"]) for m in matches]
            ages = [a for a in ages if a]
            year = rec_year or (round(sum(ages) / len(ages)) if ages else None)
            areas = [m["floor_area_m2"] for m in matches if m["floor_area_m2"]]
            epc_source = "epc"
            address = matches[0]["address"]
            stats["epc"] += 1
        else:
            band = None
            sap = None
            year = rec_year
            areas = []
            address = ", ".join(
                p for p in [tags.get("addr:housenumber"), tags.get("addr:street")] if p
            ) or tags.get("name")
            epc_source = None

        period = year_to_band(year)

        # No certificate: estimate the band from the EHS distribution. Prefer the
        # age prior (strongest signal), then dwelling type, then the region.
        if band is None and use_cat in ("bostad_enfamilj", "bostad_flerfamilj"):
            prior = None
            if period and period in age_prior:
                prior = age_prior[period]["bands"]
                epc_source = "ehs_prior_age"
            elif btag in EHS_TYPE and EHS_TYPE[btag] in type_prior:
                prior = type_prior[EHS_TYPE[btag]]["bands"]
                epc_source = "ehs_prior_type"
            elif region_prior:
                prior = region_prior
                epc_source = "ehs_prior_region"
            if prior:
                band = sample_band(prior, osm_id)
                stats[epc_source] += 1

        if band is None:
            stats["no_estimate"] += 1

        records.append(
            {
                "coordinates": [ring],
                "height": round(height, 1),
                "floors": int(levels) if levels else None,
                "year": int(year) if year else None,
                "footprint_m2": footprint_m2(ring),
                "eclass": band,
                "has_epc": epc_source == "epc",
                "epc_source": epc_source,
                "sap": sap,
                "use_cat": use_cat,
                "osm_building": btag,
                "address": address,
                "postcode": postcode or None,
                "uprn": uprn or None,
                "tabula_period": period,
                "floor_area_m2": round(sum(areas), 1) if areas else None,
                "epc_certificates": len(matches),
                "osm_id": osm_id,
            }
        )

    band_dist = Counter(r["eclass"] for r in records if r["eclass"])
    summary = {
        "id": city["id"],
        "name": city["name"],
        "district": city["district"],
        "region": city["region"],
        "lat": city["lat"],
        "lon": city["lon"],
        "radius_m": city["radius_m"],
        "buildings": len(records),
        "with_epc": stats["epc"],
        "estimated_from_ehs": sum(v for k, v in stats.items() if k.startswith("ehs_prior")),
        "no_band": stats["no_estimate"],
        "band_distribution": {b: band_dist.get(b, 0) for b in BANDS},
        "data_file": f"uk/buildings_{city['id']}.json",
    }

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out = OUT_DIR / f"buildings_{city['id']}.json"
    out.write_text(json.dumps(records, ensure_ascii=False), encoding="utf-8")
    print(
        f"  {len(records):,} buildings -> {out.relative_to(ROOT)} "
        f"({out.stat().st_size / 1e6:.1f} MB)"
    )
    print(
        f"    band from certificate: {stats['epc']:,}   "
        f"estimated from EHS: {summary['estimated_from_ehs']:,}   "
        f"no band: {stats['no_estimate']:,}"
    )
    return summary


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--city", help="build one city only")
    ap.add_argument("--refresh", action="store_true", help="ignore the Overpass cache")
    args = ap.parse_args()

    priors = load_priors()
    targets = [uk_cities.get(args.city)] if args.city else uk_cities.CITIES

    if not ingest_epc.have_token():
        print(
            "\nNOTE: no UK_EPC_API_TOKEN set. Building bands will be estimated from\n"
            "English Housing Survey priors and tagged epc_source=ehs_prior_*.\n"
            "Set the token and re-run to use real certificates."
        )

    summaries = [build_city(c, priors, refresh=args.refresh) for c in targets]

    registry = OUT_DIR / "cities.json"
    existing = {}
    if registry.exists():
        existing = {c["id"]: c for c in json.loads(registry.read_text(encoding="utf-8"))["cities"]}
    for s in summaries:
        existing[s["id"]] = s
    ordered = [existing[c["id"]] for c in uk_cities.CITIES if c["id"] in existing]

    registry.write_text(
        json.dumps(
            {
                "country": "gb",
                "country_name": "United Kingdom",
                "sources": {
                    "footprints": "OpenStreetMap (ODbL)",
                    "certificates": "Energy Performance of Buildings Register, MHCLG (OGL v3.0)",
                    "priors": "English Housing Survey 2024-25, MHCLG (OGL v3.0)",
                },
                "cities": ordered,
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"\nwrote {registry.relative_to(ROOT)}")

    total = sum(s["buildings"] for s in summaries)
    print(f"\n{total:,} buildings across {len(summaries)} cities")


if __name__ == "__main__":
    main()
