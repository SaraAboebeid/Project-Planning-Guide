"""
be_data_pipeline.py - Belgian district payloads for the viewer and the wizard.

Same payload shape as tools/uk/uk_data_pipeline.py, so the viewer, backend and
simulation read Belgian buildings without a new schema. What differs is where
each field comes from, because Belgium has no open per-building EPC register:

  footprints   Brussels: UrbIS Buildings WFS (CC0).  Flanders: GRB GBG WFS (Modellicentie).
               Wallonia: PICC building footprints (INSPIRE BU WFS, SPW, CC BY 4.0).
  addresses    UrbIS Addresses / GRB Adres points / BeST Address for Wallonia (BOSA,
               CC BY 4.0 - the ICAR WFS carries street ids, not names) (house + box
               numbers) -> dwellings_est, address, postcode, municipality NIS
               (+ CaPaKey / statistical sector in Brussels)
  use, height  OpenStreetMap tags where an OSM building overlaps (ODbL), else the PICC
  and year     building class in Wallonia; heights from data/be_raw/heights_<city>.json
               when present (UrbIS 3D / 3D GRB) or the Walloon LoD1 layer (LiDAR
               2013-14), else OSM height/levels, else a default by use - height_source says which
  party walls  footprint edges touching a neighbour (the registers are topologically
               clean, so terraces share exact edges) -> adiabatic walls in the model
  period       OSM start_date when tagged, else sampled from Statbel's building stock
               for the municipality x building type (year_source=statbel_prior)
  archetype    TABULA BE (VITO): type from attached walls and dwellings, period from year

There are no EPC bands: eclass stays null and has_epc false. Per-building EPCs
exist only behind per-address lookups (VEKA "Zoek een EPC", Brussels PEB
registry); bulk access needs a research agreement with the regions.

    python tools/be/be_data_pipeline.py [--city brussels_saint_gilles] [--refresh]
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import sys
import time
from collections import Counter, defaultdict
from pathlib import Path

import requests
from pyproj import Transformer
from shapely.geometry import Point, shape
from shapely.strtree import STRtree

sys.path.insert(0, str(Path(__file__).resolve().parent))
import cities as be_cities  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
RAW_DIR = ROOT / "data" / "be_raw"
OUT_DIRS = [ROOT / "frontend" / "public" / "be", ROOT / "assets" / "be"]

HEADERS = {"User-Agent": "project-planning-guide/1.0 (retrofit dashboard; research)"}
OVERPASS_MIRRORS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
]
WFS = {
    "urbis": {
        "url": "https://geoservices-urbis.irisnet.be/geoserver/urbisvector/wfs",
        "buildings": "urbisvector:Buildings",
        "addresses": "urbisvector:Addresses",
        "sort": "INSPIRE_ID",  # GeoServer pages (startIndex) only with a stable sort
    },
    "grb": {
        "url": "https://geo.api.vlaanderen.be/GRB/wfs",
        "buildings": "GRB:GBG",
        "addresses": "GRB:Adres",
        "sort": "UIDN",
    },
    "picc": {
        "url": "https://geoservices.wallonie.be/geoserver/inspire_bu/wfs",
        "buildings": "inspire_bu:BU.Building_building_emprise",
        "lod1": "inspire_bu:BU.Building_building_lod1",
        "sort": "objectid",
    },
}
SOURCE_LABEL = {
    "urbis": "UrbIS Buildings + Addresses, paradigm.brussels (CC0)",
    "grb": "GRB Gebouw aan de grond + Adres, Digitaal Vlaanderen (Modellicentie Gratis Hergebruik)",
    "picc": "PICC building footprints + Batiments 3D LoD1 2013-2014, SPW (CC BY 4.0); "
            "BeST Address, BOSA (Walloon data CC BY 4.0)",
}
BEST_WAL_URL = "https://opendata.bosa.be/download/best/openaddress-bewal.zip"

# PICC footprint class (the suffix of gml_description) -> use category, used when
# no OSM tag says otherwise. "Habitation" is split by address count later.
PICC_USE = {
    "Habitation": "residential", "Annexe": "komplement",
    "Commerce ou service": "verksamhet", "Industrie": "industri", "Agricole": "industri",
    "Administration": "samhalle", "Lieu de culte": "samhalle", "Culture, sport ou loisir": "samhalle",
    "Enseignement": "samhalle", "Santé": "samhalle", "Sante": "samhalle",
    "Scolaire": "samhalle", "Scolaire fondamental": "samhalle", "Scolaire secondaire": "samhalle",
    "Scolaire supérieur": "samhalle", "Police": "samhalle", "Maison de repos": "samhalle",
    "Maison communale": "samhalle", "Hôpital": "samhalle", "Station service": "verksamhet",
}
# The Walloon LoD1 height runs to the top of the roof and reads 5-7 m above
# 3.1 m x OSM building:levels, even on flat roofs (ground reference at the low
# side on Liege's slopes, plus attics). Against 299 Liege buildings with OSM
# levels, floors = (h - 5 m) / 3.3 m fits best without over-fitting; the
# simulated volume uses the roof top minus half that allowance (pitched roof).
PICC_ROOF_M = 5.0
PICC_STOREY_M = 3.3

TO_L72 = Transformer.from_crs(4326, 31370, always_xy=True)
TO_WGS = Transformer.from_crs(31370, 4326, always_xy=True)

# OSM building tag -> the viewer's existing use categories (as the UK pipeline).
USE_CAT = {
    "house": "bostad_enfamilj", "detached": "bostad_enfamilj", "semidetached_house": "bostad_enfamilj",
    "terrace": "bostad_enfamilj", "bungalow": "bostad_enfamilj",
    "apartments": "bostad_flerfamilj", "residential": "bostad_flerfamilj", "dormitory": "bostad_flerfamilj",
    "commercial": "verksamhet", "retail": "verksamhet", "office": "verksamhet", "hotel": "verksamhet",
    "supermarket": "verksamhet", "kiosk": "verksamhet",
    "industrial": "industri", "warehouse": "industri", "factory": "industri",
    "school": "samhalle", "university": "samhalle", "college": "samhalle", "hospital": "samhalle",
    "church": "samhalle", "chapel": "samhalle", "cathedral": "samhalle", "civic": "samhalle",
    "public": "samhalle", "government": "samhalle", "train_station": "samhalle",
    "kindergarten": "samhalle", "sports_hall": "samhalle",
    "garage": "komplement", "garages": "komplement", "shed": "komplement", "carport": "komplement",
    "roof": "komplement", "service": "komplement",
}
RESIDENTIAL = ("bostad_enfamilj", "bostad_flerfamilj")

# Brussels/Flemish town houses: ~3.0-3.3 m storeys (high 19th-century ceilings).
LEVEL_HEIGHT_M = 3.1
DEFAULT_FLOORS = {"bostad_enfamilj": 3, "bostad_flerfamilj": 5, "verksamhet": 4,
                  "industri": 2, "samhalle": 3, "komplement": 1, "ovrigt": 2}

# Statbel construction classes -> TABULA BE period code.
TABULA_PERIODS = [(1945, "01"), (1970, "02"), (1990, "03"), (2005, "04"), (2011, "05"), (9999, "06")]
# Party walls shorter than this are corner touches, not a shared wall.
PARTY_MIN_EDGE_M = 2.0
PARTY_TOUCH_M = 0.3


# ---------------------------------------------------------------------------
# Fetching
# ---------------------------------------------------------------------------
def _bbox_l72(city: dict) -> tuple[float, float, float, float]:
    x, y = TO_L72.transform(city["lon"], city["lat"])
    r = city["radius_m"]
    return x - r, y - r, x + r, y + r


def fetch_wfs(city: dict, layer: str, refresh: bool) -> list[dict]:
    cache = RAW_DIR / f"{city['source']}_{city['id']}_{layer}.json"
    if cache.exists() and not refresh:
        return json.loads(cache.read_text(encoding="utf-8"))
    src = WFS[city["source"]]
    x0, y0, x1, y1 = _bbox_l72(city)
    feats, start, page = [], 0, 5000
    print(f"  WFS {src[layer]} ...")
    while True:
        params = {
            "service": "WFS", "version": "2.0.0", "request": "GetFeature",
            "typeNames": src[layer], "outputFormat": "application/json",
            "srsName": "EPSG:31370", "bbox": f"{x0},{y0},{x1},{y1},EPSG:31370",
            "count": page, "startIndex": start, "sortBy": src["sort"],
        }
        for attempt in range(4):
            try:
                r = requests.get(src["url"], params=params, headers=HEADERS, timeout=180)
                r.raise_for_status()
                batch = r.json().get("features", [])
                break
            except (requests.RequestException, ValueError) as e:
                print(f"    retry {attempt + 1}: {e}")
                time.sleep(10 * (attempt + 1))
        else:
            raise SystemExit(f"WFS {src[layer]} kept failing")
        feats += batch
        if len(batch) < page:
            break
        start += page
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps(feats), encoding="utf-8")
    print(f"    {len(feats):,} features -> {cache.name}")
    return feats


def fetch_best(city: dict, refresh: bool) -> list[dict]:
    """Walloon BeST address points inside the district bbox, as GeoJSON-like features.

    The Walloon INSPIRE address WFS only references street ids, so names come from
    BOSA's BeST export (one ~300 MB CSV for the region, streamed once per district).
    """
    import csv
    import io
    import zipfile
    cache = RAW_DIR / f"best_{city['id']}_addresses.json"
    if cache.exists() and not refresh:
        return json.loads(cache.read_text(encoding="utf-8"))
    zpath = RAW_DIR / "openaddress-bewal.zip"
    if not zpath.exists() or refresh:
        print("  BeST Wallonia addresses (~60 MB) ...")
        r = requests.get(BEST_WAL_URL, headers=HEADERS, timeout=900)
        r.raise_for_status()
        RAW_DIR.mkdir(parents=True, exist_ok=True)
        zpath.write_bytes(r.content)
    x0, y0, x1, y1 = _bbox_l72(city)
    feats = []
    with zipfile.ZipFile(zpath) as z, z.open(z.namelist()[0]) as f:
        for row in csv.DictReader(io.TextIOWrapper(f, encoding="utf-8")):
            if row.get("status") != "current":
                continue
            try:
                x, y = float(row["EPSG:31370_x"]), float(row["EPSG:31370_y"])
            except (KeyError, ValueError):
                continue
            if x0 <= x <= x1 and y0 <= y <= y1:
                feats.append({"geometry": {"type": "Point", "coordinates": [x, y]}, "properties": {
                    k: row.get(k) or None for k in ("address_id", "house_number", "box_number",
                                                     "streetname_fr", "postcode", "municipality_id")}})
    cache.write_text(json.dumps(feats, ensure_ascii=False), encoding="utf-8")
    print(f"    {len(feats):,} BeST addresses -> {cache.name}")
    return feats


def picc_heights(city: dict, refresh: bool) -> dict:
    """LoD1 roof height above ground (LiDAR 2013-14) keyed like the PICC footprint id.

    The LoD1 layer shares the footprint's UUID; buildings put up since the flight
    have no LoD1 record and fall back to OSM / the default by use.
    """
    out = {}
    for f in fetch_wfs(city, "lod1", refresh):
        p = f["properties"]
        m = re.search(r"value\s*:\s*([\d.]+)", str(p.get("heightaboveground") or ""))
        if m and float(m.group(1)) > 0:
            top = float(m.group(1))
            out["BE.WL.GEOREF." + p["inspireid_localid"]] = {
                "roof_mean": round(max(3.0, top - PICC_ROOF_M / 2), 1),
                "ridge": top,
                "floors": max(1, round((top - PICC_ROOF_M) / PICC_STOREY_M)),
            }
    return out


def fetch_osm(city: dict, refresh: bool) -> list[dict]:
    cache = RAW_DIR / f"osm_{city['id']}.json"
    if cache.exists() and not refresh:
        return json.loads(cache.read_text(encoding="utf-8"))
    q = f"""[out:json][timeout:240];
(way["building"](around:{city['radius_m'] + 50},{city['lat']},{city['lon']});
 relation["building"]["type"="multipolygon"](around:{city['radius_m'] + 50},{city['lat']},{city['lon']}););
out geom;"""
    print("  Overpass (OSM building tags) ...")
    els = None
    for attempt in range(6):
        url = OVERPASS_MIRRORS[attempt % len(OVERPASS_MIRRORS)]
        try:
            r = requests.post(url, data={"data": q}, headers=HEADERS, timeout=300)
            if r.status_code in (429, 502, 503, 504):
                raise requests.HTTPError(str(r.status_code))
            r.raise_for_status()
            els = r.json().get("elements", [])
            break
        except (requests.RequestException, ValueError) as e:
            print(f"    {url.split('/')[2]} busy ({e}); trying next")
            time.sleep(10 * (attempt + 1))
    if els is None:
        raise SystemExit("Overpass kept refusing; try again later")
    cache.write_text(json.dumps(els), encoding="utf-8")
    print(f"    {len(els):,} OSM buildings -> {cache.name}")
    return els


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _stable_unit(key: str) -> float:
    """Deterministic uniform [0,1) per building, so re-runs sample the same period."""
    return int(hashlib.sha1(key.encode()).hexdigest()[:8], 16) / 0x100000000


def _year_from_osm(tags: dict) -> int | None:
    for k in ("start_date", "construction_date", "building:start_date"):
        m = re.search(r"(1[5-9]\d\d|20[0-2]\d)", str(tags.get(k) or ""))
        if m:
            return int(m.group(1))
    return None


def _height_from_osm(tags: dict) -> tuple[float | None, int | None]:
    h = lv = None
    try:
        h = float(str(tags.get("height", "")).replace("m", "").strip()) or None
    except ValueError:
        pass
    try:
        lv = int(float(tags.get("building:levels", ""))) or None
    except ValueError:
        pass
    return h, lv


def tabula_period(year: int) -> str:
    return next(code for last, code in TABULA_PERIODS if year <= last)


def sample_statbel_year(prior: dict, key: str) -> int | None:
    """Sample a construction class by its building count, then a year inside it."""
    periods = {k: v for k, v in (prior or {}).get("periods", {}).items() if v}
    total = sum(periods.values())
    if not total:
        return None
    u = _stable_unit(key) * total
    for rng, n in periods.items():
        if u < n:
            a, b = (int(x) for x in rng.split("-"))
            return a + int(_stable_unit(key + "y") * (b - a + 1))
        u -= n
    a, b = (int(x) for x in list(periods)[-1].split("-"))
    return b


class TabulaBE:
    def __init__(self) -> None:
        doc = json.loads((OUT_DIRS[0] / "tabula_be.json").read_text(encoding="utf-8"))
        self.by_code = {a["code"]: a for a in doc["archetypes"]}

    def code_for(self, use_cat: str, neighbours: int, dwellings: int, floors: int, period: str) -> str | None:
        if use_cat == "bostad_enfamilj" and dwellings <= 2:
            kind = {0: ("SFH", "Gen"), 1: ("TH", "Semi")}.get(neighbours, ("TH", "Gen"))
        elif use_cat in RESIDENTIAL:
            # TABULA BE sample sizes: MFH.Small 3-6 flats, MFH.Gen 11-33, AB 20-390.
            if dwellings > 30 or floors >= 8:
                kind = ("AB", "Gen") if period != "01" else ("MFH", "Gen")  # no pre-1946 AB
            elif dwellings > 6:
                kind = ("MFH", "Gen")
            else:
                kind = ("MFH", "Small")
        else:
            return None
        code = f"BE.N.{kind[0]}.{period}.{kind[1]}"
        return code if code in self.by_code else None


# ---------------------------------------------------------------------------
# Build one district
# ---------------------------------------------------------------------------
def build_city(city: dict, refresh: bool = False) -> dict:
    print(f"\n== {city['id']} ({city['district']}) ==")
    src = city["source"]
    bfeats = fetch_wfs(city, "buildings", refresh)
    afeats = fetch_best(city, refresh) if src == "picc" else fetch_wfs(city, "addresses", refresh)
    osm = fetch_osm(city, refresh)
    statbel = json.loads((OUT_DIRS[0] / "statbel_building_stock.json").read_text(encoding="utf-8"))["municipalities"]
    tabula = TabulaBE()
    heights_path = RAW_DIR / f"heights_{city['id']}.json"
    if heights_path.exists():
        heights = json.loads(heights_path.read_text(encoding="utf-8"))
    else:
        heights = picc_heights(city, refresh) if src == "picc" else {}

    cx, cy = TO_L72.transform(city["lon"], city["lat"])
    centre = Point(cx, cy)
    polys, props = [], []
    for f in bfeats:
        if src == "grb" and (f["properties"].get("LBLTYPE") or "") not in ("hoofdgebouw", "bijgebouw"):
            continue
        g = shape(f["geometry"])
        if g.geom_type == "MultiPolygon":
            g = max(g.geoms, key=lambda p: p.area)
        if g.geom_type != "Polygon" or g.area < 8 or g.centroid.distance(centre) > city["radius_m"]:
            continue
        if not g.is_valid:
            g = g.buffer(0)
            if g.geom_type != "Polygon":
                continue
        polys.append(g)
        props.append(f["properties"])
    tree = STRtree(polys)
    print(f"  {len(polys):,} footprints inside {city['radius_m']} m")
    # PICC draws a terrace house's back extension as its own "Annexe" footprint.
    # A wall shared with it is still not exposed, but it does not make the house
    # terraced/semi-detached, so annexes are left out of the neighbour count.
    is_annex = [src == "picc" and (q.get("gml_description") or "").endswith(" - Annexe") for q in props]

    # Addresses -> buildings. UrbIS names the building (BU_ID); GRB and BeST need
    # point-in-polygon. BeST points sometimes sit on the pavement just outside the
    # facade, so Wallonia also takes the nearest footprint within a few metres.
    id_index = {}
    if src == "urbis":
        id_index = {p["INSPIRE_ID"]: i for i, p in enumerate(props)}
    addrs = defaultdict(list)
    for f in afeats:
        p = f["properties"]
        i = id_index.get(p.get("BU_ID")) if src == "urbis" else None
        if i is None:
            pt = shape(f["geometry"])
            hit = [int(j) for j in tree.query(pt.buffer(1.0), predicate="intersects")]
            i = hit[0] if hit else None
            if i is None and src == "picc":
                j = int(tree.nearest(pt))
                i = j if polys[j].distance(pt) <= 5.0 else None
        if i is not None:
            addrs[i].append(p)

    # Buildings without an address (annexes, offices, schools) still need a
    # municipality for the Statbel prior: take the nearest address point's.
    nis_pts, nis_vals = [], []
    for f in afeats:
        p = f["properties"]
        v = ((p.get("MUNNISCODE") or "").rsplit("/", 1)[-1] if src == "urbis"
             else p.get("municipality_id") if src == "picc" else p.get("NISCODE"))
        if v:
            nis_pts.append(shape(f["geometry"]))
            nis_vals.append(v)
    nis_tree = STRtree(nis_pts) if nis_pts else None

    # OSM tags -> the footprint the OSM polygon overlaps most.
    osm_for = {}
    for el in osm:
        geom = el.get("geometry")
        if el.get("type") != "way" or not geom or len(geom) < 4:
            continue
        try:
            op = shape({"type": "Polygon", "coordinates": [[TO_L72.transform(q["lon"], q["lat"]) for q in geom]]})
            op = op if op.is_valid else op.buffer(0)
        except Exception:
            continue
        for j in tree.query(op, predicate="intersects"):
            j = int(j)
            ov = polys[j].intersection(op).area / max(polys[j].area, 1e-6)
            if ov > 0.5 and ov > osm_for.get(j, (0, None))[0]:
                osm_for[j] = (ov, el.get("tags") or {}, el.get("id"))

    stats = Counter()
    records = []
    for i, pg in enumerate(polys):
        p = props[i]
        a_list = addrs.get(i, [])
        tags = osm_for.get(i, (0, {}, None))[1]
        osm_id = osm_for.get(i, (0, {}, None))[2]

        # Party walls: edges that lie on another footprint's outline.
        mids, neighbours = [], set()
        coords = list(pg.exterior.coords)
        for a, b in zip(coords, coords[1:]):
            if math.dist(a, b) < PARTY_MIN_EDGE_M:
                continue
            mid = Point((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
            for j in tree.query(mid.buffer(PARTY_TOUCH_M), predicate="intersects"):
                j = int(j)
                if j != i and polys[j].exterior.distance(mid) <= PARTY_TOUCH_M:
                    lon, lat = TO_WGS.transform(mid.x, mid.y)
                    mids.append([round(lon, 7), round(lat, 7)])
                    if not is_annex[j]:
                        neighbours.add(j)
                    break

        # Dwellings: distinct (house number, box). A number without boxes is one unit.
        if src == "urbis":
            units = {(q.get("POLICENUM"), q.get("BOXNUMBER")) for q in a_list}
            numbers = sorted({q.get("POLICENUM") for q in a_list if q.get("POLICENUM")}, key=lambda s: (len(s), s))
            street = a_list[0].get("STRNAMEFRE") if a_list else None
            postcode = a_list[0].get("ZIPCODE") if a_list else None
            nis = (a_list[0].get("MUNNISCODE") or "").rsplit("/", 1)[-1] if a_list else None
        elif src == "picc":
            units = {(q.get("house_number"), q.get("box_number")) for q in a_list}
            numbers = sorted({q.get("house_number") for q in a_list if q.get("house_number")}, key=lambda s: (len(s), s))
            street = a_list[0].get("streetname_fr") if a_list else None
            postcode = a_list[0].get("postcode") if a_list else None
            nis = a_list[0].get("municipality_id") if a_list else None
        else:
            units = {(q.get("HUISNR"), q.get("BUSNR")) for q in a_list}
            numbers = sorted({q.get("HUISNR") for q in a_list if q.get("HUISNR")}, key=lambda s: (len(s), s))
            street = a_list[0].get("STRAATNM") if a_list else None
            postcode = a_list[0].get("POSTCODE") if a_list else None
            nis = a_list[0].get("NISCODE") if a_list else None
        if not nis and nis_tree is not None:
            nis = nis_vals[int(nis_tree.nearest(pg.centroid))]
        nis = nis or city.get("nis")
        dwellings = len(units)

        # Use: OSM tag first; then the PICC class in Wallonia; else a register
        # address makes it (probably) residential.
        btag = tags.get("building")
        use_cat = USE_CAT.get(btag or "")
        picc_class = (p.get("gml_description") or "").rsplit(" - ", 1)[-1] if src == "picc" else None
        picc_use = PICC_USE.get(picc_class or "")
        if use_cat is None and picc_use and not (picc_use == "komplement" and dwellings):
            if picc_use == "residential":
                use_cat = "bostad_flerfamilj" if dwellings >= 3 else "bostad_enfamilj"
            else:
                use_cat = picc_use
            use_source = "picc_class"
        elif use_cat is None:
            if dwellings >= 3:
                use_cat = "bostad_flerfamilj"
            elif dwellings >= 1:
                use_cat = "bostad_enfamilj"
            else:
                use_cat = "komplement" if pg.area < 40 else "ovrigt"
            use_source = "address_count" if dwellings else "footprint_size"
        else:
            use_source = "osm"
            if use_cat == "bostad_enfamilj" and dwellings >= 3:
                use_cat = "bostad_flerfamilj"   # a "house" holding several boxed flats

        # Height and floors.
        uid = p.get("INSPIRE_ID") or p.get("inspireid_localid") or str(p.get("OIDN"))
        osm_h, osm_lv = _height_from_osm(tags)
        ridge = None
        if uid in heights:
            # Volume-equivalent flat-roof height; the ridge is kept for display.
            height, ridge, height_source = heights[uid]["roof_mean"], heights[uid]["ridge"], "register_3d"
        elif osm_h:
            height, height_source = osm_h, "osm_height"
        elif osm_lv:
            height, height_source = osm_lv * LEVEL_HEIGHT_M, "osm_levels"
        else:
            height, height_source = DEFAULT_FLOORS.get(use_cat, 2) * LEVEL_HEIGHT_M, "default_by_use"
        floors = osm_lv or (heights.get(uid) or {}).get("floors") or max(1, round(height / LEVEL_HEIGHT_M))
        stats[f"height_{height_source}"] += 1

        # Construction year: OSM, else a Statbel-weighted sample for this municipality/type.
        year = _year_from_osm(tags)
        year_source = "osm" if year else None
        if year is None:
            stype = ("apartment_building" if use_cat == "bostad_flerfamilj"
                     else {0: "detached", 1: "semi_detached"}.get(len(neighbours), "closed")
                     if use_cat == "bostad_enfamilj" else "other")
            year = sample_statbel_year((statbel.get(nis or "") or {}).get("types", {}).get(stype), uid)
            year_source = "statbel_prior" if year else None
        stats[f"year_{year_source}"] += 1
        period = tabula_period(year) if year else None

        code = tabula.code_for(use_cat, len(neighbours), dwellings, floors, period) if period else None
        arch = tabula.by_code.get(code) if code else None
        ab = (arch or {}).get("as_built") or {}
        stats["tabula_matched"] += bool(arch)

        ring = [[round(v, 7) for v in TO_WGS.transform(x, y)] for x, y in pg.exterior.coords]
        records.append({
            "coordinates": [ring],
            "height": round(height, 1),
            "floors": floors,
            "year": year,
            "footprint_m2": round(pg.area, 1),
            "eclass": None,
            "has_epc": False,
            "epc_source": None,
            "use_cat": use_cat,
            "use_source": use_source,
            "osm_building": btag,
            "osm_id": osm_id,
            "address": " ".join(x for x in [street, "-".join(numbers[:1] + numbers[-1:]) if len(numbers) > 1 else (numbers[0] if numbers else None)] if x) or tags.get("name"),
            "postcode": postcode,
            "nis": nis,
            "register_id": uid,
            "register_class": picc_class,
            "capakey": (a_list[0].get("CAPAKEY") if a_list and src == "urbis" else None),
            "stat_sector": (a_list[0].get("STATNISCODE") if a_list and src == "urbis" else None),
            "dwellings_est": dwellings or None,
            "attached_neighbours": len(neighbours),
            "party_wall_midpoints": mids or None,
            "height_source": height_source,
            "year_source": year_source,
            "tabula_code": code,
            "tabula_period": period if year_source == "osm" else None,
            "tabula_period_used": arch["period"] if arch else None,
            "tabula_u_wall": ab.get("u_wall"),
            "tabula_u_roof": ab.get("u_roof"),
            "tabula_u_win": ab.get("u_window"),
            "tabula_u_door": ab.get("u_door"),
            "tabula_u_floor": ab.get("u_floor"),
            "tabula_kwh_m2_yr": ab.get("kwh_m2_yr"),
            "tabula_u_source": ("known_year" if year_source == "osm" else "statbel_sampled_period") if arch else None,
            "gross_floor_area_m2": round(pg.area * floors, 1),
            "height_ridge": ridge,
        })

    n = len(records)
    summary = {
        "id": city["id"], "name": city["name"], "district": city["district"], "region": city["region"],
        "lat": city["lat"], "lon": city["lon"], "radius_m": city["radius_m"],
        "buildings": n, "with_epc": 0, "estimated_from_ehs": 0, "no_band": n,
        "band_distribution": {b: 0 for b in "ABCDEFG"},
        "residential": sum(1 for r in records if r["use_cat"] in RESIDENTIAL),
        "tabula_matched": stats["tabula_matched"],
        "with_party_walls": sum(1 for r in records if r["party_wall_midpoints"]),
        "year_from_osm": stats["year_osm"],
        "height_sources": {k[7:]: v for k, v in stats.items() if k.startswith("height_")},
        "footprint_source": src,
        "data_file": f"be/buildings_{city['id']}.json",
    }
    for out_dir in OUT_DIRS:
        out_dir.mkdir(parents=True, exist_ok=True)
        (out_dir / f"buildings_{city['id']}.json").write_text(json.dumps(records, ensure_ascii=False), encoding="utf-8")
    print(f"  {n:,} buildings -> be/buildings_{city['id']}.json")
    print(f"    residential {summary['residential']:,}  TABULA {stats['tabula_matched']:,}  "
          f"party walls {summary['with_party_walls']:,}  OSM-tagged {len(osm_for):,}")
    print(f"    heights {summary['height_sources']}  year: osm {stats['year_osm']:,}, "
          f"statbel prior {stats['year_statbel_prior']:,}, none {stats['year_None']:,}")
    print(f"    TABULA types {dict(Counter((r['tabula_code'] or '-')[5:-3] for r in records).most_common(8))}")
    return summary


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--city", help="build one district only")
    ap.add_argument("--refresh", action="store_true", help="ignore cached WFS/Overpass responses")
    args = ap.parse_args()
    targets = [be_cities.get(args.city)] if args.city else be_cities.CITIES
    summaries = [build_city(c, refresh=args.refresh) for c in targets]

    for out_dir in OUT_DIRS:
        reg = out_dir / "cities.json"
        existing = {c["id"]: c for c in json.loads(reg.read_text(encoding="utf-8"))["cities"]} if reg.exists() else {}
        for s in summaries:
            existing[s["id"]] = s
        ordered = [existing[c["id"]] for c in be_cities.CITIES if c["id"] in existing]
        reg.write_text(json.dumps({
            "country": "be",
            "country_name": "Belgium",
            "sources": {
                "footprints": SOURCE_LABEL,
                "certificates": None,
                "priors": "Statbel building stock (CC BY 4.0); TABULA BE, VITO",
                "tags": "OpenStreetMap (ODbL)",
            },
            "cities": ordered,
        }, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
