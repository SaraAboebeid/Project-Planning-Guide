"""
Anchor EPC register certificates to building footprints spatially, via UPRN.

Why this exists: the EPC register gives each certificate a UPRN and a band but
no coordinates, and most OSM/EUBUCCO footprints carry no address, so the
address join in uk_data_pipeline.py only reaches ~4% of Rotherham. OS Open UPRN
(free OS OpenData) maps UPRN -> lat/lon, which lets every certificate be
dropped onto the footprint it sits in.

Inputs (all offline once cached):
  * base payload      frontend/public/uk/buildings_<city>.json.bak-20260730
                      (the untouched uk_data_pipeline.py output)
  * postcodes         data/os/<city>_postcodes.txt (reverse-geocoded footprint
                      centroids via postcodes.io)
  * certificates      data/uk_raw/epc_cache/<postcode>.json   (ingest_epc.fetch_postcode)
  * details           data/uk_raw/epc_detail_cache/<cert>.json (ingest_epc.fetch_certificate_detail)
  * UPRN coordinates  data/os/uprn_<city>.json, cut from data/os/openuprn_gb.zip
                      on first run

Optional extra layers, used when their caches exist:
  * non-domestic EPCs + DECs  data/uk_raw/epc_{cepc,dec}_<council>.json and
                              epc_detail_cache_nondom/ (ingest_nondomestic_epc.py)
  * full certificates         data/uk_raw/epc_bulk_<la_code>.csv (ingest_epc_bulk.py):
                              every field incl. wall/roof/window/floor descriptions,
                              turned into U-values by epc_fabric.py
  * metered consumption       frontend/public/uk/desnz_postcode_<city>.json
                              (ingest_desnz_postcode.py)

Per building, only each dwelling's LATEST certificate counts (older ones are
superseded), and band, SAP, year, floor area and heating are all taken from
that same set so they agree with each other.

Usage:
    python tools/uk/anchor_epc_uprn.py [--city rotherham] [--max-dist 30] [--dry-run]
"""
from __future__ import annotations

import argparse
import csv
import io
import json
import re
import statistics
import sys
import zipfile
from collections import Counter, defaultdict
from pathlib import Path

from pyproj import Transformer
from shapely.geometry import Point, Polygon
from shapely.strtree import STRtree

sys.path.insert(0, str(Path(__file__).resolve().parent))
import uk_data_pipeline as P  # noqa: E402
from ingest_epc import norm_postcode as ingest_epc_norm  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OS_DIR = ROOT / "data" / "os"
CACHE_DIR = ROOT / "data" / "uk_raw" / "epc_cache"
DETAIL_DIR = ROOT / "data" / "uk_raw" / "epc_detail_cache"
OUT_DIRS = [ROOT / "frontend" / "public" / "uk", ROOT / "assets" / "uk"]
BASE_SUFFIX = ".bak-20260730"
SOURCE = "EPC register (OS UPRN)"

# SAP 2012 rating thresholds -> band (same scale the register uses).
SAP_BANDS = [(92, "A"), (81, "B"), (69, "C"), (55, "D"), (39, "E"), (21, "F"), (1, "G")]
# RdSAP built_form codes.
BUILT_FORM = {"1": "Detached", "2": "Semi-detached", "3": "End-terrace", "4": "Mid-terrace",
              "5": "Enclosed end-terrace", "6": "Enclosed mid-terrace"}
RESIDENTIAL = ("bostad_enfamilj", "bostad_flerfamilj")


def sap_band(sap: float) -> str:
    return next((b for t, b in SAP_BANDS if sap >= t), "G")


def fuel_from_heating(desc: str | None, mains_gas: bool | None) -> str | None:
    """The register's detail feed leaves main_fuel empty, so derive it from the
    main-heating description (which names the fuel in RdSAP wording)."""
    s = (desc or "").lower()
    if not s:
        return None
    for key, fuel in (("heat pump", "electricity"), ("mains gas", "mains gas"), ("lpg", "LPG"),
                      ("oil", "oil"), ("coal", "coal"), ("anthracite", "coal"),
                      ("wood", "biomass"), ("biomass", "biomass"), ("electric", "electricity"),
                      ("community", "community heating")):
        if key in s:
            return fuel
    return "mains gas" if mains_gas else None


def load_uprn_coords(city: dict) -> dict[str, tuple[float, float]]:
    path = OS_DIR / f"uprn_{city['id']}.json"
    if not path.exists():
        # One pass over the 41M-row GB file, keeping UPRNs in the city's box.
        pad_lat = city["radius_m"] * 1.5 / 111_320
        pad_lon = pad_lat / 0.6
        lat0, lon0 = city["lat"], city["lon"]
        keep = {}
        with zipfile.ZipFile(OS_DIR / "openuprn_gb.zip") as z:
            name = next(n for n in z.namelist() if n.lower().endswith(".csv"))
            with z.open(name) as fh:
                for row in csv.DictReader(io.TextIOWrapper(fh, encoding="utf-8-sig")):
                    la, lo = float(row["LATITUDE"]), float(row["LONGITUDE"])
                    if abs(la - lat0) <= pad_lat and abs(lo - lon0) <= pad_lon:
                        keep[row["UPRN"]] = [lo, la]
        path.write_text(json.dumps(keep), encoding="utf-8")
    return {k: tuple(v) for k, v in json.loads(path.read_text(encoding="utf-8")).items()}


def city_postcodes(city: dict) -> set[str]:
    """Every postcode that may hold dwellings in the city's footprints: the
    reverse-geocoded list, OS Code-Point Open postcodes inside the radius (if
    cut), and any cached postcode the register files under the same council.
    Reverse geocoding alone misses blocks whose postcode centroid isn't the
    nearest one to any footprint."""
    tokens = (OS_DIR / f"{city['id']}_postcodes.txt").read_text(encoding="utf-8").split()
    # The file is whitespace-separated "S60 1AB" pairs.
    postcodes = {f"{tokens[i]} {tokens[i + 1]}" for i in range(0, len(tokens) - 1, 2)}
    cp = OS_DIR / f"codepoint_{city['id']}.json"
    if not cp.exists() and (OS_DIR / "codepo_gb.zip").exists():
        # Code-Point Open: headerless CSVs, one per postcode area -
        # postcode, quality, easting, northing, ...
        cx, cy = Transformer.from_crs(4326, 27700, always_xy=True).transform(city["lon"], city["lat"])
        r2 = (city["radius_m"] + 300) ** 2
        keep = []
        with zipfile.ZipFile(OS_DIR / "codepo_gb.zip") as z:
            for name in z.namelist():
                if not re.search(r"Data/CSV/[a-z]+\.csv$", name, re.I):
                    continue
                with z.open(name) as fh:
                    for row in csv.reader(io.TextIOWrapper(fh, encoding="utf-8")):
                        e, n = float(row[2] or 0), float(row[3] or 0)
                        if (e - cx) ** 2 + (n - cy) ** 2 <= r2:
                            keep.append(ingest_epc_norm(row[0]))
        cp.write_text(json.dumps(sorted(keep)), encoding="utf-8")
    if cp.exists():
        postcodes |= set(json.loads(cp.read_text(encoding="utf-8")))
    for f in CACHE_DIR.glob("*.json"):
        pc = f.stem.replace("_", " ")
        if pc in postcodes:
            continue
        rows = json.loads(f.read_text(encoding="utf-8"))
        if rows and rows[0].get("council") == city.get("local_authority"):
            postcodes.add(pc)
    return postcodes


def load_certificates(city: dict) -> list[dict]:
    postcodes = city_postcodes(city)
    certs, missing = {}, []
    for pc in postcodes:
        f = CACHE_DIR / f"{pc.replace(' ', '_')}.json"
        if not f.exists():
            missing.append(pc)
            continue
        for c in json.loads(f.read_text(encoding="utf-8")):
            if c.get("uprn") and c.get("certificate_number"):
                certs[c["certificate_number"]] = c
    print(f"  {len(postcodes):,} postcodes ({len(missing)} not cached), {len(certs):,} certificates")
    if missing:
        (OS_DIR / f"{city['id']}_postcodes_uncached.txt").write_text("\n".join(sorted(missing)), encoding="utf-8")
        print(f"  uncached list -> data/os/{city['id']}_postcodes_uncached.txt "
              "(fetch with ingest_epc.fetch_postcodes, then re-run)")
    return list(certs.values())


def detail(cert_number: str) -> dict | None:
    f = DETAIL_DIR / f"{cert_number.replace('/', '_')}.json"
    if not f.exists():
        return None
    # Older certificate schemas wrap text as {"value": ..., "language": "1"};
    # unwrap so descriptions are plain strings.
    return {k: (v.get("value") if isinstance(v, dict) and "value" in v else v)
            for k, v in json.loads(f.read_text(encoding="utf-8")).items()}


def load_bulk(city: dict) -> dict[str, dict]:
    """Newest full-load CSV row per UPRN for the city's local authority, or {}."""
    import csv
    la = city.get("la_code")
    f = ROOT / "data" / "uk_raw" / f"epc_bulk_{la}.csv" if la else None
    if not f or not f.exists():
        return {}
    best: dict[str, dict] = {}
    with open(f, newline="", encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            u = (row.get("uprn") or "").strip()
            if not u:
                continue
            if u not in best or (row.get("lodgement_date") or "") > (best[u].get("lodgement_date") or ""):
                best[u] = row
    print(f"  bulk certificates: {len(best):,} UPRNs from {f.relative_to(ROOT)}")
    return best


def detail_from_bulk(row: dict) -> dict:
    """Map a full-load CSV row onto the detail-cache fields used below."""
    import epc_fabric

    def num(v):
        try:
            return float(v)
        except (TypeError, ValueError):
            return None
    ptype = (row.get("property_type") or "").strip()
    form = (row.get("built_form") or "").strip()
    heat = row.get("mainheat_description") or None
    return {
        "sap": num(row.get("current_energy_efficiency")),
        "floor_area_m2": num(row.get("total_floor_area")),
        "property_type": (f"{form} {ptype}".strip().capitalize() if ptype.lower() in ("house", "bungalow") and form and form != "NO DATA!" else ptype or None),
        "built_form": form or None,
        "age_band": row.get("construction_age_band") or None,
        "mainheat_description": heat,
        "hotwater_description": row.get("hotwater_description") or None,
        "mains_gas_flag": {"Y": True, "N": False}.get((row.get("mains_gas_flag") or "").strip().upper()),
        "energy_consumption_kwh_m2_yr": num(row.get("energy_consumption_current")),
        "has_heat_pump": ("heat pump" in heat.lower()) if heat else None,
        "has_solar_pv": (num(row.get("photo_supply")) or 0) > 0 if row.get("photo_supply") not in (None, "") else None,
        "fabric": epc_fabric.fabric_u(row),
        "fabric_text": {k: row.get(k) for k in ("walls_description", "roof_description", "windows_description", "floor_description")},
    }


def latest_per_dwelling(certs: list[dict], bulk: dict[str, dict] | None = None) -> list[dict]:
    """One record per UPRN: the newest certificate's band, enriched with the
    newest certificate that has a cached detail document. With the full-load
    CSV, the newest bulk row fills any missing detail and always supplies the
    fabric U-values; UPRNs only the bulk file knows become dwellings too."""
    bulk = bulk or {}
    by_uprn = defaultdict(list)
    for c in certs:
        by_uprn[c["uprn"]].append(c)
    for u, row in bulk.items():
        if u not in by_uprn:
            by_uprn[u].append({"uprn": u, "band": row.get("current_energy_rating"), "postcode": row.get("postcode"),
                               "registration_date": row.get("lodgement_date"),
                               "certificate_number": row.get("certificate_number") or f"bulk-{u}"})
    out = []
    for uprn, cs in by_uprn.items():
        cs.sort(key=lambda c: c.get("registration_date") or "", reverse=True)
        d = next((x for x in (detail(c["certificate_number"]) for c in cs) if x), None)
        if uprn in bulk:
            b = detail_from_bulk(bulk[uprn])
            d = {**b, **(d or {}), "fabric": b["fabric"], "fabric_text": b["fabric_text"]}
        out.append({"uprn": uprn, "band": cs[0].get("band"), "date": cs[0].get("registration_date"),
                    "postcode": cs[0].get("postcode"), "n_certs": len(cs), "detail": d or {}})
    return out


def footprint_homes_and_party_walls(blds, polys, tree, uprn_xy, to_bng, touch_m: float = 0.6, min_edge_m: float = 2.0):
    """Per footprint: the number of UPRN address points inside it, and the
    lon/lat midpoints of its edges that touch another footprint (shared/party
    walls, which the energy model treats as adiabatic)."""
    to_wgs = Transformer.from_crs(27700, 4326, always_xy=True)
    pts = [Point(*to_bng.transform(*xy)) for xy in uprn_xy.values()]
    pt_tree = STRtree(pts)
    homes, party = [], []
    for i, pg in enumerate(polys):
        # 1 m grace: address points often sit on the drawn outline.
        homes.append(len(pt_tree.query(pg.buffer(1.0), predicate="contains")))
        mids = []
        coords = list(pg.exterior.coords) if pg.geom_type == "Polygon" else []
        for (x0, y0), (x1, y1) in zip(coords, coords[1:]):
            if ((x1 - x0) ** 2 + (y1 - y0) ** 2) ** 0.5 < min_edge_m:
                continue
            mid = Point((x0 + x1) / 2, (y0 + y1) / 2)
            near = [int(j) for j in tree.query(mid.buffer(touch_m), predicate="intersects") if int(j) != i]
            if any(polys[j].exterior.distance(mid) <= touch_m for j in near if polys[j].geom_type == "Polygon"):
                lon, lat = to_wgs.transform(mid.x, mid.y)
                mids.append([round(lon, 7), round(lat, 7)])
        party.append(mids)
    return homes, party


def assign_heated_area(blds: list[dict], stats: Counter) -> None:
    """Heated area = the floor area EnergyPlus simulates (the shoebox is scaled
    to it in tools/idf/generate_idf.py); the OSM footprint stays the building's
    shape. Mirrors how Sweden simulates Atemp rather than the gross footprint.

    Residential footprints (homes and areas both from EPCs where possible):
      * certified homes contribute their EPC total floor area (internal,
        within the thermal envelope - RdSAP TFA);
      * address points WITHOUT a certificate are only counted as homes while
        the footprint still has room for them: extra homes =
        round((gross x typical EPC/gross ratio - certified area) / median
        certified home), capped at the uncertified address count. Garages,
        annexes and duplicate address points then stop inflating the count
        (231 Canklow Road: 8 address points, 3 certified houses);
      * no certificate at all: gross floor area x the typical ratio.
    The typical ratio is measured on footprints whose every address point is
    certified (median of certified area / (footprint x floors)).
    Non-residential: non-domestic EPC or DEC floor area when present, else gross.
    """
    full = [sum(b["_tfas"]) / (b["footprint_m2"] * (b.get("floors") or 1))
            for b in blds if b.get("use_cat") in RESIDENTIAL and b["_tfas"] and b.get("footprint_m2")
            and b.get("uprn_count") and len(b["_tfas"]) == b["uprn_count"] == (b.get("epc_dwellings") or 0)]
    ratio = statistics.median(full) if full else 0.65
    stats["heated_ratio_sample"] = len(full)
    stats["heated_ratio_x1000"] = round(ratio * 1000)
    for b in blds:
        tfas = b.pop("_tfas", [])
        gross = (b.get("footprint_m2") or 0) * (b.get("floors") or 1)
        if b.get("use_cat") in RESIDENTIAL:
            if tfas:
                home = statistics.median(tfas)
                room = max(0.0, gross * ratio - sum(tfas))
                extra = min(max(0, (b.get("uprn_count") or 0) - len(tfas)), round(room / home) if home else 0)
                b["heated_area_m2"] = round(sum(tfas) + extra * home, 1)
                b["heated_area_source"] = "epc_sum" if extra == 0 else "epc_plus_estimate"
                b["dwellings_est"] = len(tfas) + extra
            else:
                b["heated_area_m2"] = round(gross * ratio, 1) if gross else None
                b["heated_area_source"] = "ratio_estimate" if gross else None
                b["dwellings_est"] = max(b.get("uprn_count") or 0, 1)
        else:
            nd = b.get("nd_floor_area_m2") or b.get("dec_floor_area_m2")
            b["heated_area_m2"] = round(nd, 1) if nd else (round(gross, 1) if gross else None)
            b["heated_area_source"] = "nondomestic_epc" if nd else ("gross" if gross else None)
            b["dwellings_est"] = None
        b["gross_floor_area_m2"] = round(gross, 1) if gross else None
        stats[f"heated_{b.get('heated_area_source')}"] += 1


def load_nondomestic(city: dict) -> dict[str, list[dict]]:
    """Newest non-domestic EPC / DEC per UPRN with its summarised document."""
    import ingest_nondomestic_epc as ND

    council = city.get("local_authority") or city["name"]
    out = {}
    for kind, summarise in (("non-domestic", ND.summarise_cepc), ("display", ND.summarise_dec)):
        f = ND.search_file(council, kind)
        rows = json.loads(f.read_text(encoding="utf-8")) if f.exists() else []
        items = []
        for c in ND.latest_per_uprn(rows):
            doc_path = ND.DOC_CACHE / f"{c['certificateNumber']}.json"
            doc = json.loads(doc_path.read_text(encoding="utf-8")) if doc_path.exists() else {}
            summary = summarise(doc) if doc else {}
            items.append({"uprn": str(c["uprn"]), "band": c.get("currentEnergyEfficiencyBand"),
                          "date": c.get("registrationDate"), "postcode": c.get("postcode"),
                          "address": ", ".join(x for x in (c.get("addressLine1"), c.get("addressLine2")) if x),
                          "summary": summary})
        out[kind] = items
        print(f"  {kind}: {len(items):,} UPRNs ({sum(1 for i in items if i['summary']):,} with documents)")
    return out


def modal(values):
    vals = [v for v in values if v not in (None, "", "NR")]
    return Counter(vals).most_common(1)[0][0] if vals else None


def estimate_floors(b: dict, dwellings: list[dict]) -> tuple[int | None, str]:
    """EUBUCCO reports 1 storey for most Rotherham houses even at 7-9 m tall.
    Prefer the EPC dwelling type, then height, and only for residential stock
    (a tall single-storey shed is legitimately 1 floor)."""
    floors, h = b.get("floors"), b.get("height") or 0
    if b.get("use_cat") not in RESIDENTIAL:
        return floors, "eubucco"
    types = [(d["detail"].get("property_type") or "").lower() for d in dwellings]
    types = [t for t in types if t]
    if types and all("bungalow" in t for t in types):
        return 1, "epc_property_type"
    if types and all("house" in t for t in types):
        return max(floors or 0, 2 if h < 10.5 else 3), "epc_property_type"
    if floors and floors * 3.0 >= h - 2.5:
        return floors, "eubucco"
    # Ridge height includes a pitched roof, so ~3.5 m per storey for houses.
    per = 3.5 if b.get("use_cat") == "bostad_enfamilj" else 3.0
    return max(1, round(h / per)), "height_estimate"


def fetch_missing(city: dict, uprn_xy: dict) -> None:
    """Fill the disk caches from the EPC API: search results for uncached
    postcodes, then one detail document per dwelling (its newest certificate)
    that has none. Resumable - everything fetched is cached, and a sustained
    rate limit just ends the run early."""
    import time
    import requests
    import ingest_epc

    token = ingest_epc._token()
    if not token:
        raise SystemExit(f"--fetch needs {ingest_epc.TOKEN_ENV} in the environment/.env")
    session = requests.Session()
    todo = [pc for pc in sorted(city_postcodes(city))
            if not (CACHE_DIR / f"{pc.replace(' ', '_')}.json").exists()]
    print(f"  fetching {len(todo)} uncached postcodes")
    for i, pc in enumerate(todo, 1):
        ingest_epc.fetch_postcode(pc, token, session)
        if i % 50 == 0:
            print(f"    {i}/{len(todo)} postcodes", flush=True)

    by_uprn = defaultdict(list)
    for c in load_certificates(city):
        if c["uprn"] in uprn_xy:
            by_uprn[c["uprn"]].append(c)
    need = []
    for cs in by_uprn.values():
        cs.sort(key=lambda c: c.get("registration_date") or "", reverse=True)
        if not any((DETAIL_DIR / f"{c['certificate_number'].replace('/', '_')}.json").exists() for c in cs):
            need.append(cs[0]["certificate_number"])
    print(f"  fetching details for {len(need):,} dwellings without one", flush=True)
    fails = 0
    for i, cn in enumerate(need, 1):
        fails = 0 if ingest_epc.fetch_certificate_detail(cn, token, session) else fails + 1
        if fails >= 8:
            print(f"    stopped at {i}/{len(need)}: rate limited - re-run later to resume", flush=True)
            return
        time.sleep(ingest_epc.RATE_LIMIT_SLEEP)
        if i % 200 == 0:
            print(f"    {i}/{len(need)} details", flush=True)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--city", default="rotherham")
    ap.add_argument("--max-dist", type=float, default=30.0,
                    help="metres; a UPRN outside every footprint snaps to the nearest one within this")
    ap.add_argument("--fetch", action="store_true",
                    help="first fill the EPC caches from the API (needs UK_EPC_API_TOKEN; slow, resumable)")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    from cities import CITIES  # noqa: E402
    city = next(c for c in CITIES if c["id"] == args.city)
    if args.fetch:
        fetch_missing(city, load_uprn_coords(city))
    base_path = OUT_DIRS[0] / f"buildings_{city['id']}.json{BASE_SUFFIX}"
    blds = json.loads(base_path.read_text(encoding="utf-8"))
    print(f"{city['name']}: {len(blds):,} buildings from {base_path.relative_to(ROOT)}")

    uprn_xy = load_uprn_coords(city)
    certs = load_certificates(city)
    dwellings = latest_per_dwelling(certs, load_bulk(city))

    # Metric CRS so point-in-polygon and the snap distance are in metres.
    to_bng = Transformer.from_crs(4326, 27700, always_xy=True)
    polys = []
    for b in blds:
        xs, ys = to_bng.transform(*zip(*b["coordinates"][0]))
        polys.append(Polygon(zip(xs, ys)).buffer(0))
    tree = STRtree(polys)

    def place(items: list[dict]) -> tuple[dict[int, list[dict]], Counter]:
        per, placed = defaultdict(list), Counter()
        for d in items:
            xy = uprn_xy.get(d["uprn"])
            if not xy:
                placed["no_uprn_coords"] += 1
                continue
            pt = Point(*to_bng.transform(*xy))
            hits = tree.query(pt, predicate="intersects")
            if len(hits):
                idx = int(hits[0]); placed["inside"] += 1
            else:
                idx = int(tree.nearest(pt))
                if polys[idx].distance(pt) > args.max_dist:
                    placed["too_far"] += 1
                    continue
                placed["snapped"] += 1
            per[idx].append(d)
        return per, placed

    per_bld, placed = place(dwellings)
    print(f"  {len(dwellings):,} dwellings: {dict(placed)} -> {len(per_bld):,} buildings")
    nondom = load_nondomestic(city)
    per_cepc, placed_c = place(nondom["non-domestic"])
    per_dec, placed_d = place(nondom["display"])
    print(f"  non-domestic EPC: {dict(placed_c)} -> {len(per_cepc):,} buildings; DEC: {dict(placed_d)} -> {len(per_dec):,} buildings")
    homes, party = footprint_homes_and_party_walls(blds, polys, tree, uprn_xy, to_bng)
    print(f"  addresses per footprint: {dict(Counter(min(h, 5) for h in homes))}; "
          f"footprints with a shared wall: {sum(1 for x in party if x):,}")
    desnz_path = OUT_DIRS[0] / f"desnz_postcode_{city['id']}.json"
    desnz = json.loads(desnz_path.read_text(encoding="utf-8")) if desnz_path.exists() else None

    tabula = P.TabulaGB()
    # as-built values -> archetype, to recover u_floor for untouched buildings.
    # Types share U-values within an era (SFH/terraced/MFH pre-1945 are all
    # 2.1/2.3/4.8/3.0), so the type-specific kWh estimate is part of the key.
    by_values = {}
    for (typ, period), a in tabula.by_type_period.items():
        by_values[(period, a["u_wall"], a["u_roof"], a["u_window"], a["u_door"], a["kwh_m2_yr"])] = a

    stats = Counter()
    for i, b in enumerate(blds):
        ds = per_bld.get(i, [])
        old_floors = b.get("floors")
        b["floors"], b["floors_source"] = estimate_floors(b, ds)
        if b["floors"] != old_floors:
            stats["floors_changed"] += 1

        if ds:
            det = [d["detail"] for d in ds if d["detail"]]
            saps = [x["sap"] for x in det if x.get("sap") is not None]
            sap = round(statistics.median(saps), 1) if saps else None
            bands = Counter(d["band"] for d in ds if d["band"])
            top = bands.most_common()
            band = top[0][0] if top else None
            # Break a tied mode with the band the median SAP falls in.
            if sap is not None and len(top) > 1 and top[0][1] == top[1][1]:
                tied = {bb for bb, n in top if n == top[0][1]}
                band = sap_band(sap) if sap_band(sap) in tied else band
            ages = [P.epc_age_to_year(x.get("age_band")) for x in det]
            ages = [a for a in ages if a]
            areas = [x["floor_area_m2"] for x in det if x.get("floor_area_m2")]
            heat = modal(x.get("mainheat_description") for x in det)
            gas = P._modal_bool([x.get("mains_gas_flag") for x in det])
            ptype = modal(x.get("property_type") for x in det)
            cons = [x["energy_consumption_kwh_m2_yr"] for x in det if x.get("energy_consumption_kwh_m2_yr")]

            b.update({
                "eclass": band,
                "has_epc": True,
                "epc_source": SOURCE,
                "sap": sap,
                "year": int(statistics.median(ages)) if ages else b.get("year"),
                "year_source": "epc_age_band" if ages else ("eubucco_osm" if b.get("year") else None),
                "epc_certificates": sum(d["n_certs"] for d in ds),
                "epc_dwellings": len(ds),
                "epc_dwellings_with_detail": len(det),
                "epc_latest_date": max((d["date"] or "") for d in ds) or None,
                "property_type": ptype,
                "built_form": BUILT_FORM.get(str(modal(x.get("built_form") for x in det)), None),
                "mainheat_description": heat,
                "main_fuel": fuel_from_heating(heat, gas),
                "mainheat_energy_eff": modal(x.get("mainheat_energy_eff") for x in det),
                "hotwater_description": modal(x.get("hotwater_description") for x in det),
                "has_heat_pump": P._modal_bool([x.get("has_heat_pump") for x in det]),
                "has_solar_pv": P._modal_bool([x.get("has_solar_pv") for x in det]),
                "mains_gas_flag": gas,
                "energy_consumption_kwh_m2_yr": round(statistics.mean(cons), 1) if cons else None,
            })
            # Fabric as the certificates describe it today. Median over dwellings,
            # ignoring those whose roof/floor is another dwelling (mid flats).
            for key in ("u_wall", "u_roof", "u_win", "u_floor"):
                vals = [x["fabric"][key] for x in det if (x.get("fabric") or {}).get(key) is not None]
                b[f"{key}_epc"] = round(statistics.median(vals), 3) if vals else None
            if b.get("u_wall_epc") is not None:
                stats["fabric_from_epc"] += 1
            if areas:
                # Dwellings without a cached detail get the building's mean flat size.
                b["floor_area_m2"] = round(statistics.mean(areas) * len(ds), 1)
                b["floor_area_source"] = "epc_sum" if len(areas) == len(ds) else "epc_mean_x_dwellings"
            stats["anchored"] += 1
            if sap is not None and band and sap_band(sap) != band:
                stats["band_sap_disagree"] += 1
        elif b.get("epc_source") == "epc":
            stats["kept_address_match"] += 1
            b["year_source"] = "epc_age_band" if b.get("year") else None
            b["floor_area_source"] = "epc_sum" if b.get("floor_area_m2") else None
            b["main_fuel"] = b.get("main_fuel") or fuel_from_heating(b.get("mainheat_description"), b.get("mains_gas_flag"))
        else:
            b["year_source"] = "eubucco_osm" if b.get("year") else None

        # Homes = addresses (OS Open UPRN) inside the footprint - OSM often draws a
        # semi-detached pair or a terrace row as one polygon - never fewer than the
        # certified dwellings placed on it. Energy is compared per home.
        b["uprn_count"] = homes[i]
        b["party_wall_midpoints"] = party[i] or None
        # Certified homes' EPC total floor areas - the basis of the heated area,
        # resolved in a second pass once Rotherham-wide ratios are known.
        b["_tfas"] = [d["detail"]["floor_area_m2"] for d in ds if (d.get("detail") or {}).get("floor_area_m2")]

        # Certificate postcode: the modal one among the building's certificates,
        # else its OSM tag. It keys the DESNZ metered consumption below.
        cert_pcs = [x.get("postcode") for x in ds + per_cepc.get(i, []) + per_dec.get(i, [])]
        b["epc_postcode"] = modal(cert_pcs) or b.get("postcode")

        cepc = sorted(per_cepc.get(i, []), key=lambda x: x["date"] or "", reverse=True)
        if cepc:
            docs = [x["summary"] for x in cepc if x["summary"]]
            areas = [x["floor_area_m2"] for x in docs if x.get("floor_area_m2")]
            b.update({
                "nd_epc_band": modal(x["band"] for x in cepc),
                "nd_epc_units": len(cepc),
                "nd_epc_latest_date": cepc[0]["date"],
                "nd_property_type": modal(x.get("property_type") for x in docs),
                "nd_main_fuel": modal(x.get("main_fuel") for x in docs),
                "nd_floor_area_m2": round(sum(areas), 1) if areas else None,
                "nd_asset_rating": round(statistics.median([x["asset_rating"] for x in docs if x.get("asset_rating") is not None]), 1)
                    if any(x.get("asset_rating") is not None for x in docs) else None,
                "nd_energy_kwh_m2_yr": round(statistics.median([x["energy_kwh_m2_yr"] for x in docs if x.get("energy_kwh_m2_yr")]), 1)
                    if any(x.get("energy_kwh_m2_yr") for x in docs) else None,
            })
            stats["nd_epc_buildings"] += 1
            # A building with no domestic certificate takes its band from the
            # non-domestic one (A+ folds into A) instead of an EHS estimate.
            if not ds and b.get("epc_source") != "epc" and b["nd_epc_band"]:
                b.update({"eclass": "A" if b["nd_epc_band"] == "A+" else b["nd_epc_band"], "has_epc": True,
                          "epc_source": "EPC register non-domestic (OS UPRN)"})
                stats["band_from_nd_epc"] += 1

        decs = sorted(per_dec.get(i, []), key=lambda x: x["date"] or "", reverse=True)
        if decs:
            top = decs[0]
            m = (top["summary"] or {}).get("metered") or {}
            b.update({
                "dec_band": top["band"],
                "dec_latest_date": top["date"],
                "dec_name": top["address"],
                "dec_units": len(decs),
                "dec_operational_rating": (top["summary"] or {}).get("operational_rating"),
                "dec_property_type": (top["summary"] or {}).get("property_type"),
                "dec_floor_area_m2": (top["summary"] or {}).get("floor_area_m2"),
                # Metered annual kWh per fuel for the newest DEC's 12-month period.
                "dec_metered_kwh": {fuel: v["kwh"] for fuel, v in m.items()} or None,
                "dec_period": [(top["summary"] or {}).get("period_start"), (top["summary"] or {}).get("period_end")]
                    if top["summary"] else None,
            })
            stats["dec_buildings"] += 1
            if not ds and not cepc and b.get("epc_source") != "epc" and top["band"]:
                b.update({"eclass": "A" if top["band"] == "A+" else top["band"], "has_epc": True,
                          "epc_source": "DEC register (OS UPRN)"})
                stats["band_from_dec"] += 1

        if desnz and b.get("epc_postcode"):
            rec = desnz["postcodes"].get(b["epc_postcode"]) or {}
            if rec:
                b["desnz_postcode"] = b["epc_postcode"]
                b["desnz_year"] = desnz["year"]
                for fuel in ("gas", "electricity"):
                    f = rec.get(fuel) or {}
                    b[f"desnz_{fuel}_median_kwh"] = round(f["median_kwh"]) if f.get("median_kwh") is not None else None
                    b[f"desnz_{fuel}_meters"] = int(f["meters"]) if f.get("meters") is not None else None
                stats["desnz_matched"] += 1

        # TABULA: re-pick the archetype when the EPC gave a real year or type.
        period = P.year_to_band(b.get("year")) if b.get("year_source") == "epc_age_band" else None
        if period and b.get("use_cat") in RESIDENTIAL + ("ovrigt",):
            pt = (b.get("property_type") or "").lower()
            subtype = ("apartment" if ("flat" in pt or "maisonette" in pt) else
                       "detached" if pt.startswith("detached") else
                       "terraced" if pt else None)
            a = tabula.lookup(b.get("use_cat") if b.get("use_cat") in RESIDENTIAL else "bostad_enfamilj",
                              period, subtype)
            if a:
                b.update({"tabula_period": period, "tabula_period_used": period, "tabula_u_source": "known_year",
                          "tabula_u_wall": a["u_wall"], "tabula_u_roof": a["u_roof"], "tabula_u_win": a["u_window"],
                          "tabula_u_door": a["u_door"], "tabula_u_floor": a["u_floor"],
                          "tabula_kwh_m2_yr": a["kwh_m2_yr"]})
                stats["tabula_known_year"] += 1
        if b.get("tabula_u_wall") is not None and b.get("tabula_u_floor") is None:
            a = by_values.get((b.get("tabula_period_used"), b["tabula_u_wall"], b["tabula_u_roof"],
                               b["tabula_u_win"], b["tabula_u_door"], b.get("tabula_kwh_m2_yr")))
            b["tabula_u_floor"] = a["u_floor"] if a else None
        # Leftovers from earlier ad-hoc runs.
        for k in ("heating", "epc_n_certs", "epc_floor_area_m2"):
            b.pop(k, None)

    assign_heated_area(blds, stats)
    print(f"  {dict(stats)}")
    src = Counter(b.get("epc_source") for b in blds)
    print(f"  epc_source: {dict(src)}")
    if args.dry_run:
        return

    for out_dir in OUT_DIRS:
        out = out_dir / f"buildings_{city['id']}.json"
        out.write_text(json.dumps(blds, ensure_ascii=False), encoding="utf-8")
        _update_registry(out_dir / "cities.json", city["id"], blds)
        print(f"  wrote {out.relative_to(ROOT)}")


def _update_registry(path: Path, city_id: str, blds: list[dict]) -> None:
    if not path.exists():
        return
    reg = json.loads(path.read_text(encoding="utf-8"))
    for c in reg["cities"]:
        if c["id"] != city_id:
            continue
        bands = Counter(b["eclass"] for b in blds if b.get("eclass"))
        c.update({
            "buildings": len(blds),
            "with_epc": sum(1 for b in blds if b.get("has_epc")),
            "estimated_from_ehs": sum(1 for b in blds if str(b.get("epc_source") or "").startswith("ehs_prior")),
            "no_band": sum(1 for b in blds if not b.get("eclass")),
            "band_distribution": {k: bands.get(k, 0) for k in P.BANDS},
            "tabula_matched": sum(1 for b in blds if b.get("tabula_u_wall") is not None),
        })
    path.write_text(json.dumps(reg, indent=2, ensure_ascii=False), encoding="utf-8")


if __name__ == "__main__":
    main()
