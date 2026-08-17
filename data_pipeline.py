"""
data_pipeline.py — all Python data processing for the Gothenburg 3D viewer.
Loads EUBUCCO + EPC + TABULA, processes ~92k buildings, returns a dict
with JSON strings and statistics that build.py injects into the HTML.

Usage:
    from data_pipeline import process_data
    data = process_data()
"""

import geopandas as gpd
import pandas as pd
import numpy as np
import json
import os
import re
import unicodedata
from pathlib import Path

import duckdb
from shapely import wkb as shapely_wkb

PROJECT_ROOT = Path(__file__).resolve().parent

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
_DEFAULT_EUBUCCO_DIR = PROJECT_ROOT / "data" / "eubucco"
EUBUCCO_DATA_DIR = Path(os.environ.get("EUBUCCO_DATA_DIR", str(_DEFAULT_EUBUCCO_DIR))).expanduser()
PARQUET_PATH = str(EUBUCCO_DATA_DIR / "SE23.parquet")
GPKG_PATH = str(EUBUCCO_DATA_DIR / "SE23.gpkg")

# Working bounding box (EPSG:4326) — defaults to Gothenburg; _apply_city() below
# repoints all of these to another city from tools/se/se_cities.py.
LON_MIN, LON_MAX = 11.85, 12.10
LAT_MIN, LAT_MAX = 57.62, 57.80

# Municipality scoping for EPC cadastral matching (set per-city by _apply_city).
_KOMMUN = "Göteborg"
_REGION_KOMMUNS = ["Göteborg", "Mölndal", "Partille", "Härryda", "Kungälv", "Ale",
                   "Lerum", "Öckerö", "Kungsbacka", "Stenungsund", "Tjörn",
                   "Lilla Edet", "Alingsås", "Bollebygd"]


def _region_in() -> str:
    """SQL IN-list fragment of region municipalities (trusted config, not user input)."""
    return "'" + "','".join(_REGION_KOMMUNS) + "'"


def _apply_city(city_key: str):
    """Repoint the module config (paths, bbox, municipalities) at a registered city."""
    global PARQUET_PATH, GPKG_PATH, LON_MIN, LON_MAX, LAT_MIN, LAT_MAX, _KOMMUN, _REGION_KOMMUNS
    import sys as _sys
    from pathlib import Path as _P
    _sys.path.insert(0, str(_P(__file__).resolve().parent / "tools" / "se"))
    from se_cities import get_city
    c = get_city(city_key)
    root = _P(__file__).resolve().parent
    eubucco_dir = _P(os.environ.get("EUBUCCO_DATA_DIR", str(root / "data" / "eubucco"))).expanduser()
    eubucco_file = _P(c["eubucco"]).name
    PARQUET_PATH = str(eubucco_dir / eubucco_file.replace(".gpkg", ".parquet"))
    GPKG_PATH = str(eubucco_dir / eubucco_file)
    LON_MIN, LAT_MIN, LON_MAX, LAT_MAX = c["bbox4326"]
    _KOMMUN = c["kommun"]
    _REGION_KOMMUNS = c["region_kommuns"]
    print(f"[city] {c['name']}  bbox={c['bbox4326']}  eubucco_parquet={PARQUET_PATH}  eubucco_gpkg={GPKG_PATH}", flush=True)
    return c

USE_COLORS = {
    "bostad_enfamilj":   [255, 165,  50, 210],
    "bostad_flerfamilj": [255, 210,  60, 210],
    "verksamhet":        [ 70, 180, 255, 210],
    "industri":          [200,  80,  60, 210],
    "samhalle":          [ 70, 210, 140, 210],
    "komplement":        [140, 140, 160, 180],
    "ovrigt":            [160, 120, 200, 180],
}
USE_LABELS = {
    "bostad_enfamilj":   "Residential - single family",
    "bostad_flerfamilj": "Residential - multi-family",
    "verksamhet":        "Commercial / office",
    "industri":          "Industrial",
    "samhalle":          "Public / civic",
    "komplement":        "Outbuilding / garage",
    "ovrigt":            "Other / unknown",
}
ECLASS_COLORS = {
    "A": [ 22, 163,  74, 230],
    "B": [ 74, 222, 128, 220],
    "C": [190, 242,  60, 210],
    "D": [250, 204,  21, 215],
    "E": [251, 146,  60, 220],
    "F": [239,  68,  68, 225],
    "G": [153,  27,  27, 230],
}
ECLASS_LABELS = {
    "A": "A - Very efficient",
    "B": "B - Efficient",
    "C": "C - Above average",
    "D": "D - Average",
    "E": "E - Below average",
    "F": "F - Poor",
    "G": "G - Very poor",
}
TABULA_PERIODS = ["...1960", "1961-1975", "1976-1985", "1986-1995", "1996-2005"]
PERIOD_KEYS    = ['...1960', '1961-1975', '1976-1985', '1986-1995', '1996-2005', 'post-2005']

_TABULA_DIR = PROJECT_ROOT / "data" / "sensitivity" / "FW_ Map selection in notebook"


# ---------------------------------------------------------------------------
# Utility functions
# ---------------------------------------------------------------------------
def _norm(s: str) -> str:
    """Fold Swedish å/ä/ö -> a/a/o so plain ASCII substrings match."""
    return unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode("ascii").lower()


def andamal_to_use(andamal: str) -> str:
    """Map EPC andamal1 string to a colour category key."""
    if not isinstance(andamal, str):
        return "ovrigt"
    a = _norm(andamal)
    if "komplement" in a or "ekonomi" in a:
        return "komplement"
    if "flerfamilj" in a or "flerbostad" in a or "hyreshus" in a:
        return "bostad_flerfamilj"
    if "bostad" in a or "smahus" in a or "radhus" in a or "kedjehus" in a:
        return "bostad_enfamilj"
    if "verksamhet" in a or "handel" in a or "kontor" in a or "hotell" in a or "restaurang" in a:
        return "verksamhet"
    if "industri" in a or "tillverkning" in a or "lager" in a:
        return "industri"
    if ("samhall" in a or "skola" in a or "vard" in a
            or "samfund" in a or "offentlig" in a or "special" in a
            or "idrott" in a or "bad" in a or "kultur" in a):
        return "samhalle"
    return "ovrigt"


def _epc_fallback_points(gdf_3006, blank_idx):
    """Locate Gothenburg EPCs that never reached a footprint (blank/unmatched
    cadastral) and attach each to the nearest still-blank building.

    Two accurate sources, no block-centroid (that measured ~266 m off):
      • exact-cadastral footprint centroid — for EPCs whose own cadastral has a
        footprint somewhere (tight parcel), and
      • a cached address geocode (tools/se/geocode_epc.py) for the rest.
    Returns a DataFrame indexed by the EUBUCCO building index with the same EPC
    columns the main match fills, for buildings that had none.
    """
    import duckdb as _dd
    con2 = _dd.connect("data/sensitivity/epc_sweden.duckdb", read_only=True)
    con2.execute("INSTALL spatial; LOAD spatial;")
    # One row per unlinked Göteborg EPC address, with energy + an exact-cadastral
    # centroid where the cadastral has any footprint (else lon/lat NULL → geocode).
    df = con2.execute(
        """
        WITH linked AS (SELECT DISTINCT FormularId FROM footprints WHERE FormularId IS NOT NULL),
        cad_cent AS (
            SELECT upper(fastighetsbeteckning) cad,
                   AVG(ST_X(ST_Centroid(ST_GeomFromWKB(geom)))) lon,
                   AVG(ST_Y(ST_Centroid(ST_GeomFromWKB(geom)))) lat
            FROM footprints WHERE fastighetsbeteckning IS NOT NULL AND TRIM(fastighetsbeteckning)<>''
            GROUP BY 1)
        SELECT TRIM(e."IdAdr")                       AS address,
               MIN(e."EgiSpecifikEnergianvandning")  AS energy_kwh_m2,
               MIN(e."EgiEnergiklass")               AS energy_class,
               MIN(e."EgenNybyggAr")                 AS year_built,
               MAX(e."EgenAtemp")                    AS area_atemp,
               MAX(e."EgenAntalPlan")                AS floors_epc,
               MIN(e."IdFastBet")                    AS fastighet,
               CASE
                   WHEN MIN(e."EgenByggnadsKat") ILIKE '%flerbostad%' THEN 'Flerbostadshus'
                   WHEN MIN(e."EgenByggnadsKat") ILIKE '%bostad%'     THEN 'Bostad småhus'
                   WHEN MIN(e."EgenByggnadsKat") ILIKE '%lokal%'      THEN 'Verksamhet'
                   WHEN MIN(e."EgenByggnadsKat") ILIKE '%industri%'   THEN 'Industri'
                   WHEN MIN(e."EgenByggnadsKat") ILIKE '%special%'    THEN 'Samhälle'
                   ELSE MIN(e."EgenByggnadsKat") END AS andamal1,
               cc.lon, cc.lat
        FROM epc e
        LEFT JOIN cad_cent cc ON upper(TRIM(e."IdFastBet")) = cc.cad
        WHERE e.IdKommun='""" + _KOMMUN + """' AND e."EgiSpecifikEnergianvandning" IS NOT NULL
          AND e."IdAdr" IS NOT NULL AND TRIM(e."IdAdr")<>''
          AND e.FormularId NOT IN (SELECT FormularId FROM linked)
        GROUP BY TRIM(e."IdAdr"), cc.lon, cc.lat
        """
    ).fetchdf()
    con2.close()

    # Fill the missing coordinates from the geocode cache.
    cache_path = Path("data/epc_geocode_cache.json")
    cache = {}
    if cache_path.exists():
        try:
            cache = json.loads(cache_path.read_text(encoding="utf-8"))
        except Exception:
            cache = {}
    need = df["lon"].isna()
    if need.any():
        gc = df.loc[need, "address"].map(lambda a: cache.get(a))
        df.loc[need, "lon"] = gc.map(lambda v: v[0] if v else np.nan)
        df.loc[need, "lat"] = gc.map(lambda v: v[1] if v else np.nan)

    df = df.dropna(subset=["lon", "lat"]).reset_index(drop=True)
    n_cad = int((~need).sum())
    print(f"  EPC fallback candidates: {len(df):,}  (cadastral-centroid {n_cad:,}, geocoded {len(df)-n_cad:,})")
    if df.empty:
        return None

    pts = gpd.GeoDataFrame(
        df, geometry=gpd.points_from_xy(df["lon"], df["lat"]), crs="EPSG:4326"
    ).to_crs("EPSG:3006")

    # Attach to the nearest building that still has NO energy, within 40 m of the
    # EPC point. Dedup both ways: each building keeps its single nearest EPC, and
    # each EPC lands on only its single nearest building (never spread a
    # certificate across neighbours — same rule as the primary match).
    ATTACH_M = 40
    blanks = gdf_3006.loc[gdf_3006.index.isin(blank_idx), ["geometry"]].reset_index().rename(columns={"index": "eubucco_idx"})
    if blanks.empty:
        return None
    j = gpd.sjoin_nearest(blanks, pts, how="inner", max_distance=ATTACH_M, distance_col="d")
    j = j.sort_values("d").drop_duplicates("eubucco_idx").drop_duplicates("index_right")

    cols = ["andamal1", "fastighet", "year_built", "floors_epc", "area_atemp",
            "energy_kwh_m2", "energy_class", "address"]
    out = j.set_index("eubucco_idx")[cols].rename(columns={
        "andamal1": "andamal1_epc", "fastighet": "fastighet_epc",
        "year_built": "year_built_epc", "area_atemp": "area_atemp_epc",
        "address": "address_epc"})
    out["all_addresses"] = out["address_epc"]
    out["formular_id"] = np.nan
    return out


def _load_tabula_lookup():
    with open(_TABULA_DIR / "tabula_swedish_data.json", encoding="utf-8") as f:
        envelope = json.load(f)
    with open(_TABULA_DIR / "tabula_webtool_scraped.json", encoding="utf-8") as f:
        energy = json.load(f)
    buildings_energy = energy.get("buildings", {})
    lookup = {}
    for code, env in envelope.items():
        btype  = env["building_type"]
        period = env["period"]
        eng    = buildings_energy.get(code, {})
        zones  = eng.get("zones", {})
        lookup[(btype, period)] = {
            "period":       period,
            "u_wall":       env["u_values"].get("wall"),
            "u_roof":       env["u_values"].get("roof"),
            "u_window":     env["u_values"].get("window"),
            "u_floor":      env["u_values"].get("floor"),
            "heat_z3":      zones.get("3", {}).get("net_energy_demand"),
            "heat_z2":      zones.get("2", {}).get("net_energy_demand"),
            "heat_z1":      zones.get("1", {}).get("net_energy_demand"),
            "constr_wall":  env.get("construction_types", {}).get("wall"),
            "constr_roof":  env.get("construction_types", {}).get("roof"),
            "constr_floor": env.get("construction_types", {}).get("floor"),
        }
    return lookup


def _year_to_period(year):
    if year is None or pd.isna(year):
        return None
    y = int(year)
    if y <= 1960:   return "...1960"
    elif y <= 1975: return "1961-1975"
    elif y <= 1985: return "1976-1985"
    elif y <= 1995: return "1986-1995"
    elif y <= 2005: return "1996-2005"
    return "post-2005"


def _use_to_btype(use_cat):
    if use_cat == "bostad_enfamilj":   return "SFH"
    if use_cat == "bostad_flerfamilj": return "MFH"
    return None


def geom_to_coords(geom):
    if geom is None or geom.is_empty:
        return None
    if geom.geom_type == "Polygon":
        return [[[round(x, 6), round(y, 6)] for x, y in geom.exterior.coords]]
    elif geom.geom_type == "MultiPolygon":
        biggest = max(geom.geoms, key=lambda p: p.area)
        return [[[round(x, 6), round(y, 6)] for x, y in biggest.exterior.coords]]
    return None


def _sanitize(obj):
    """Replace NaN/Inf with None so json.dumps produces strictly valid JSON."""
    if isinstance(obj, float) and (obj != obj or obj == float("inf") or obj == float("-inf")):
        return None
    if isinstance(obj, dict):
        return {k: _sanitize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_sanitize(v) for v in obj]
    return obj


# ---------------------------------------------------------------------------
# Main pipeline
# ---------------------------------------------------------------------------
def process_data(city_key: str = "gothenburg") -> dict:
    """Run the full data pipeline and return all data needed by build.py.

    city_key selects the city config (paths, bbox, municipalities) from
    tools/se/se_cities.py — defaults to Gothenburg for backward compatibility.
    """
    _apply_city(city_key)

    # ── Load ──────────────────────────────────────────────────────────────
    print("Loading building data ...")
    parquet_exists = os.path.exists(PARQUET_PATH)
    gpkg_exists = os.path.exists(GPKG_PATH)
    if not parquet_exists and not gpkg_exists:
        raise FileNotFoundError(
            "Missing EUBUCCO source data for city "
            f"'{city_key}'. Expected one of:\n"
            f"- {PARQUET_PATH}\n"
            f"- {GPKG_PATH}\n"
            "Set EUBUCCO_DATA_DIR or place the files in the default data/eubucco directory."
        )
    src = PARQUET_PATH if parquet_exists else GPKG_PATH
    gdf = gpd.read_parquet(src) if src.endswith(".parquet") else gpd.read_file(src)
    print(f"  Loaded {len(gdf):,} buildings  CRS={gdf.crs}")

    if gdf.crs and gdf.crs.to_epsg() != 4326:
        print("  Reprojecting to EPSG:4326 ...")
        gdf = gdf.to_crs("EPSG:4326")

    print("  Filtering to central Gothenburg bbox ...")
    gdf = gdf.cx[LON_MIN:LON_MAX, LAT_MIN:LAT_MAX].copy()
    print(f"  {len(gdf):,} buildings in crop area")

    # ── EPC join ──────────────────────────────────────────────────────────
    print("Loading EPC footprints ...")
    con = duckdb.connect("data/sensitivity/epc_sweden.duckdb", read_only=True)
    epc_raw = con.execute("""
        WITH epc_cad AS (
            -- Representative property EPC per cadastral: the declaration covering
            -- the MOST addresses (the shared/BRF one). One energideklaration often
            -- covers a whole property (several buildings + entrances) but Lantmäteriet
            -- only FormularId-links it to ONE footprint. This lets that rating also
            -- attach to the property's other HEATED buildings (not garages/sheds).
            -- Restricted to the Gothenburg region to avoid cadastral-name collisions
            -- with other municipalities.
            SELECT cad, energy, cls, atemp, yr, floors, all_addr, first_addr FROM (
                SELECT UPPER(TRIM(IdFastBet)) AS cad,
                       MIN(EgiSpecifikEnergianvandning) AS energy,
                       MIN(EgiEnergiklass)              AS cls,
                       MAX(EgenAtemp)                   AS atemp,
                       MIN(EgenNybyggAr)                AS yr,
                       MAX(EgenAntalPlan)               AS floors,
                       STRING_AGG(DISTINCT TRIM(IdAdr), ' | ' ORDER BY TRIM(IdAdr)) AS all_addr,
                       MIN(IdAdr)                       AS first_addr,
                       ROW_NUMBER() OVER (PARTITION BY UPPER(TRIM(IdFastBet))
                                          ORDER BY COUNT(DISTINCT TRIM(IdAdr)) DESC, FormularId DESC) AS rn
                FROM epc
                WHERE IdFastBet IS NOT NULL AND TRIM(IdFastBet) != ''
                  AND IdAdr IS NOT NULL AND TRIM(IdAdr) != ''
                  AND EgiSpecifikEnergianvandning IS NOT NULL
                  AND IdKommun IN (""" + _region_in() + """)
                GROUP BY UPPER(TRIM(IdFastBet)), FormularId
            ) WHERE rn = 1
        )
        SELECT
            f.FormularId,
            f.geom,
            f.andamal1,
            f.fastighetsbeteckning,
            -- FormularId link first; else the property (cadastral) EPC for heated buildings.
            COALESCE(e_agg.year_built,    CASE WHEN f.FormularId IS NULL AND f.andamal1 NOT ILIKE 'Komplement%' THEN MAX(c.yr)     END) AS year_built,
            COALESCE(e_agg.floors_epc,    CASE WHEN f.FormularId IS NULL AND f.andamal1 NOT ILIKE 'Komplement%' THEN MAX(c.floors) END) AS floors_epc,
            COALESCE(e_agg.area_atemp,    CASE WHEN f.FormularId IS NULL AND f.andamal1 NOT ILIKE 'Komplement%' THEN MAX(c.atemp)  END) AS area_atemp,
            COALESCE(e_agg.energy_kwh_m2, CASE WHEN f.FormularId IS NULL AND f.andamal1 NOT ILIKE 'Komplement%' THEN MAX(c.energy) END) AS energy_kwh_m2,
            COALESCE(e_agg.energy_class,  CASE WHEN f.FormularId IS NULL AND f.andamal1 NOT ILIKE 'Komplement%' THEN MAX(c.cls)    END) AS energy_class,
            -- Primary display address: the building's own entrance (matched on
            -- husnummer), else the declaration's first address, else the property EPC's.
            COALESCE(
                MIN(CASE WHEN TRY_CAST(f.husnummer AS BIGINT) = e.IdHusnr
                              THEN TRIM(e.IdAdr) END),
                e_agg.address,
                CASE WHEN f.FormularId IS NULL AND f.andamal1 NOT ILIKE 'Komplement%' THEN MAX(c.first_addr) END
            ) AS address,
            -- ALL entrance addresses for this building. One EPC (FormularId) can
            -- list many addresses (e.g. Markmyntsgatan 16A-16E all on the same
            -- footprint); keep every one so no entrance is silently dropped and
            -- a search for "16C" can still resolve. Prefer the husnummer-matched
            -- set, then the declaration's, then the property EPC's addresses.
            COALESCE(
                STRING_AGG(DISTINCT CASE WHEN TRY_CAST(f.husnummer AS BIGINT) = e.IdHusnr
                                              THEN TRIM(e.IdAdr) END, ' | '
                           ORDER BY CASE WHEN TRY_CAST(f.husnummer AS BIGINT) = e.IdHusnr
                                              THEN TRIM(e.IdAdr) END),
                e_agg.all_addresses,
                CASE WHEN f.FormularId IS NULL AND f.andamal1 NOT ILIKE 'Komplement%' THEN MAX(c.all_addr) END
            ) AS all_addresses
        FROM footprints f
        LEFT JOIN epc e ON f.FormularId = e.FormularId
                        AND e.IdAdr IS NOT NULL
                        AND TRIM(e.IdAdr) != ''
        LEFT JOIN (
            SELECT
                FormularId,
                MIN(EgenNybyggAr)                   AS year_built,
                MAX(EgenAntalPlan)                  AS floors_epc,
                MAX(EgenAtemp)                      AS area_atemp,
                MIN(EgiSpecifikEnergianvandning)     AS energy_kwh_m2,
                MIN(EgiEnergiklass)                 AS energy_class,
                MIN(IdAdr)                          AS address,
                STRING_AGG(DISTINCT TRIM(IdAdr), ' | ' ORDER BY TRIM(IdAdr)) AS all_addresses
            FROM epc
            WHERE IdAdr IS NOT NULL AND TRIM(IdAdr) != ''
            GROUP BY FormularId
        ) e_agg ON f.FormularId = e_agg.FormularId
        LEFT JOIN epc_cad c ON UPPER(TRIM(f.fastighetsbeteckning)) = c.cad
        WHERE f.geom IS NOT NULL
        GROUP BY f.FormularId, f.objektidentitet, f.geom,
                 f.andamal1, f.fastighetsbeteckning, f.husnummer,
                 e_agg.year_built, e_agg.floors_epc, e_agg.area_atemp,
                 e_agg.energy_kwh_m2, e_agg.energy_class, e_agg.address,
                 e_agg.all_addresses
    """).fetchdf()
    con.close()

    epc_raw["geometry"] = epc_raw["geom"].apply(lambda b: shapely_wkb.loads(bytes(b)))
    epc_cols = ["FormularId", "andamal1", "fastighetsbeteckning", "year_built", "floors_epc",
                "area_atemp", "energy_kwh_m2", "energy_class", "address", "all_addresses", "geometry"]
    epc_gdf = gpd.GeoDataFrame(epc_raw[epc_cols], crs="EPSG:4326")

    epc_3006 = epc_gdf.to_crs("EPSG:3006")
    gdf_3006 = gdf.to_crs("EPSG:3006")

    bbox_poly = gpd.GeoDataFrame(
        geometry=gpd.GeoSeries.from_wkt(
            [f"POLYGON(({LON_MIN} {LAT_MIN},{LON_MAX} {LAT_MIN},{LON_MAX} {LAT_MAX},{LON_MIN} {LAT_MAX},{LON_MIN} {LAT_MIN}))"]
        ), crs="EPSG:4326"
    ).to_crs("EPSG:3006").geometry.iloc[0]
    epc_polys = epc_3006[epc_3006.geometry.intersects(bbox_poly.buffer(200))].copy()
    print(f"  EPC footprints in bbox: {len(epc_polys):,}")

    # ── EUBUCCO ↔ Lantmäteriet footprint matching ───────────────────────────
    # EUBUCCO (OSM geometry) carries no cadastral id or address, so the only link
    # to the footprint registry (and its EPC energy data) is geometric. Instead
    # of nearest-centroid — which in dense blocks assigns a building the EPC of a
    # *neighbour* and spreads one certificate across several buildings — match by
    # polygon OVERLAP: each building takes the footprint that covers the largest
    # share of its own area. Any positive overlap above a small sliver threshold
    # counts (5% — recovers buildings whose OSM outline is merely offset from the
    # cadastral footprint); buildings that overlap nothing fall back to nearest
    # centroid within 20 m. Finally an energy certificate is never spread across
    # neighbours: when one footprint lands on several buildings, only those that
    # strongly overlap it (>=30%) keep it — otherwise just the single
    # best-overlapping building does. Validated: the old centroid method handed
    # ~1,800 buildings an EPC for a footprint their polygon never touches.
    OVERLAP_MIN     = 0.05   # min overlap to prefer a footprint over centroid fallback
    OVERLAP_STRONG  = 0.30   # confident same-building; also the dedup priority cutoff
    FALLBACK_DIST_M = 20

    epc_polys = epc_polys.reset_index(drop=True)
    epc_polys["fp_idx"] = range(len(epc_polys))

    gdf_poly = (gdf_3006.reset_index()
                        .rename(columns={"index": "eubucco_idx"})[["eubucco_idx", "geometry"]]
                        .copy())
    gdf_poly["e_area"] = gdf_poly.geometry.area

    ov = gpd.overlay(gdf_poly, epc_polys[["fp_idx", "geometry"]],
                     how="intersection", keep_geom_type=False)
    ov["i_area"] = ov.geometry.area
    ov["frac"] = ov["i_area"] / ov["e_area"]
    ov_best = ov.sort_values("i_area", ascending=False).drop_duplicates("eubucco_idx")
    primary = ov_best.loc[ov_best["frac"] >= OVERLAP_MIN, ["eubucco_idx", "fp_idx", "frac"]].copy()

    # Proximity fallback for buildings that overlap no footprint at all.
    #
    # Distance is measured from the footprint centroid to the building POLYGON,
    # not to the building's centroid. A centroid is a poor proxy for a large or
    # elongated building: Lindholmen 6:9 husnummer 8 is a 39 m² cadastral stub
    # sitting ON the edge of a 3,744 m² school (0 m to the polygon, but 29 m to
    # its centroid), so the old centroid-to-centroid test rejected it at 20 m and
    # the school lost its EPC entirely (1065931, class D, 109 kWh/m²/yr).
    # Measuring to the polygon keeps the same 20 m tolerance but applies it to
    # the building's actual extent.
    rest = gdf_poly[~gdf_poly["eubucco_idx"].isin(set(primary["eubucco_idx"]))].copy()
    epc_cents = epc_polys[["fp_idx", "geometry"]].copy()
    epc_cents["geometry"] = epc_polys.geometry.centroid
    fb = gpd.sjoin_nearest(rest[["eubucco_idx", "geometry"]], epc_cents,
                           how="inner", max_distance=FALLBACK_DIST_M, distance_col="dist_m")
    fb = fb.sort_values("dist_m").drop_duplicates("eubucco_idx")[["eubucco_idx", "fp_idx"]]
    fb["frac"] = 0.0

    assign = pd.concat([primary, fb], ignore_index=True).drop_duplicates("eubucco_idx")

    # De-duplicate energy certificates across neighbours. A building that strongly
    # overlaps the footprint (>=30%) always keeps the EPC — even if a sibling also
    # overlaps it (genuine OSM split). Weak/fallback claimants are dropped only
    # when a strong claimant exists; if none do, the single best-overlapping one wins.
    energy_fp = set(epc_polys.loc[epc_polys["energy_kwh_m2"].notna(), "fp_idx"])
    assign["has_energy"] = assign["fp_idx"].isin(energy_fp)
    keep = set(assign.loc[~assign["has_energy"], "eubucco_idx"])
    for _fp, grp in assign[assign["has_energy"]].groupby("fp_idx"):
        strong = grp[grp["frac"] >= OVERLAP_STRONG]
        if len(strong):
            keep.update(strong["eubucco_idx"].tolist())
        else:
            keep.add(grp.sort_values("frac", ascending=False)["eubucco_idx"].iloc[0])
    assign = assign[~(assign["has_energy"] & ~assign["eubucco_idx"].isin(keep))]

    # Map the chosen footprint's attributes back onto each EUBUCCO building
    attr = epc_polys[["fp_idx", "andamal1", "fastighetsbeteckning", "year_built",
                      "floors_epc", "area_atemp", "energy_kwh_m2", "energy_class",
                      "address", "all_addresses", "FormularId"]]
    agg = (assign.merge(attr, on="fp_idx", how="left")
                 .set_index("eubucco_idx")
                 .rename(columns={
                     "andamal1":             "andamal1_epc",
                     "fastighetsbeteckning": "fastighet_epc",
                     "year_built":           "year_built_epc",
                     "area_atemp":           "area_atemp_epc",
                     "address":              "address_epc",
                     "all_addresses":        "all_addresses",
                     "FormularId":           "formular_id",
                 })[["andamal1_epc", "fastighet_epc", "year_built_epc", "floors_epc",
                     "area_atemp_epc", "energy_kwh_m2", "energy_class", "address_epc",
                     "all_addresses", "formular_id"]])
    gdf = gdf.join(agg)
    primary_matched = gdf["andamal1_epc"].notna().sum()

    # ── Fallback: geocoded / cadastral-centroid EPCs for still-blank buildings ──
    # The overlay above only reaches EPCs whose energy landed on a Lantmäteriet
    # footprint. ~38% of Gothenburg EPC cadastrals never do (blank cadastral, a
    # cadastral with no footprint, or only a garage), so those buildings stay
    # blank despite having a real certificate. Attach them by location.
    print("Attaching fallback EPCs (geocoded / cadastral-centroid) ...")
    blank_idx = gdf.index[gdf["energy_kwh_m2"].isna()]
    fb_epc = _epc_fallback_points(gdf_3006, set(blank_idx))
    if fb_epc is not None and len(fb_epc):
        fill = fb_epc.reindex(columns=[
            "andamal1_epc", "fastighet_epc", "year_built_epc", "floors_epc",
            "area_atemp_epc", "energy_kwh_m2", "energy_class", "address_epc",
            "all_addresses", "formular_id"])
        # Only fill rows that are still blank (never overwrite a primary match).
        target = gdf.index.isin(fill.index) & gdf["energy_kwh_m2"].isna()
        gdf.loc[target, fill.columns] = fill.loc[gdf.index[target], fill.columns].values
        print(f"  fallback attached: {int(target.sum()):,} buildings")

    matched = gdf["andamal1_epc"].notna().sum()
    print(f"  EPC-matched buildings: {primary_matched:,} primary + {matched - primary_matched:,} fallback = {matched:,}")
    gdf["use_cat"] = gdf["andamal1_epc"].apply(andamal_to_use)

    # ── TABULA matching ────────────────────────────────────────────────────
    print("Loading TABULA archetypes ...")
    _tabula_lookup = _load_tabula_lookup()
    print(f"  {len(_tabula_lookup)} TABULA archetypes loaded")

    def _tabula_match(year, use_cat):
        period = _year_to_period(year)
        btype  = _use_to_btype(use_cat)
        if not period or not btype or period == "post-2005":
            return None, period
        return _tabula_lookup.get((btype, period)), period

    print("  Matching buildings to TABULA archetypes ...")
    _tabula_rows = []
    for _, _row in gdf.iterrows():
        _arch, _period = _tabula_match(_row.get("year_built_epc"), _row.get("use_cat"))
        _tabula_rows.append({
            "tabula_period":  _period,
            "tabula_u_wall":  _arch["u_wall"]      if _arch else None,
            "tabula_u_roof":  _arch["u_roof"]      if _arch else None,
            "tabula_u_win":   _arch["u_window"]    if _arch else None,
            "tabula_heat_z3": _arch["heat_z3"]     if _arch else None,
            "tabula_wall":    _arch["constr_wall"] if _arch else None,
            "tabula_roof":    _arch["constr_roof"] if _arch else None,
        })
    _tabula_df = pd.DataFrame(_tabula_rows, index=gdf.index)
    gdf = pd.concat([gdf, _tabula_df], axis=1)
    n_tab = gdf["tabula_period"].notna().sum()
    print(f"  TABULA matched: {n_tab:,} of {len(gdf):,} buildings ({n_tab/len(gdf)*100:.1f}%)")

    # Within-period energy percentile
    print("  Computing within-period energy performance percentiles ...")
    gdf["perf_pct"] = np.nan
    for _p in TABULA_PERIODS + ["post-2005"]:
        _mask = (gdf["tabula_period"] == _p) & pd.to_numeric(gdf["energy_kwh_m2"], errors="coerce").notna()
        if _mask.sum() < 2:
            continue
        _vals = pd.to_numeric(gdf.loc[_mask, "energy_kwh_m2"], errors="coerce")
        _min, _max = _vals.quantile(0.02), _vals.quantile(0.98)
        if _max > _min:
            gdf.loc[_mask, "perf_pct"] = ((_vals - _min) / (_max - _min)).clip(0, 1)
        else:
            gdf.loc[_mask, "perf_pct"] = 0.5

    # ── Footprint area ─────────────────────────────────────────────────────
    print("  Computing footprint areas ...")
    gdf_3006_fp = gdf.to_crs("EPSG:3006")
    gdf["footprint_m2"] = gdf_3006_fp.geometry.area.round(1)

    # ── Simplify geometries ────────────────────────────────────────────────
    print("  Simplifying geometries ...")
    gdf["geometry"] = gdf["geometry"].simplify(tolerance=0.00005, preserve_topology=True)

    # ── Heights ────────────────────────────────────────────────────────────
    print("  Processing heights ...")
    gdf["elev"] = pd.to_numeric(gdf["height"], errors="coerce").clip(lower=0)
    fl = pd.to_numeric(gdf["floors"], errors="coerce")
    null_mask = gdf["elev"].isna() | (gdf["elev"] == 0)
    gdf.loc[null_mask, "elev"] = fl[null_mask] * 3.2
    gdf["elev"] = gdf["elev"].fillna(3.2)
    outliers = (gdf["elev"] > 100).sum()
    if outliers:
        print(f"  Capping {outliers} height outlier(s) >100m")
    gdf["elev"] = gdf["elev"].clip(upper=100)

    # ── Use colours ────────────────────────────────────────────────────────
    gdf["color"] = gdf["use_cat"].apply(lambda c: USE_COLORS.get(c, USE_COLORS["ovrigt"]))

    # ── Convert geometries ─────────────────────────────────────────────────
    print("  Converting geometries to coordinate rings ...")
    gdf["coordinates"] = gdf["geometry"].apply(geom_to_coords)
    gdf = gdf[gdf["coordinates"].notna()].copy()
    print(f"  {len(gdf):,} valid buildings after geometry conversion")

    # ── Build records ──────────────────────────────────────────────────────
    print("  Building JSON payload ...")
    records = []
    for _, row in gdf.iterrows():
        andamal  = row.get("andamal1_epc", None)
        use      = row.get("use_cat", "ovrigt")
        yr_epc   = row.get("year_built_epc", None)
        fl_epc   = row.get("floors_epc", None)
        area     = row.get("area_atemp_epc", None)
        enrg     = row.get("energy_kwh_m2", None)
        eklass   = row.get("energy_class", None)
        addr     = row.get("address_epc", None)
        all_addr = row.get("all_addresses", None)
        fastbet  = row.get("fastighet_epc", None)

        if addr and addr == addr:
            addr = re.sub(r'\s+(LGH|lgh|ANL|LOKAL|KONTOR|GAR|P-PLATS).*$', '', str(addr)).strip()
        else:
            addr = None
        if all_addr and all_addr == all_addr and str(all_addr).strip() not in ('', 'nan', 'None'):
            all_addr = re.sub(r'\s+(LGH|lgh|ANL|LOKAL|KONTOR|GAR|P-PLATS)[^,]*', '', str(all_addr)).strip(', ')
        else:
            all_addr = None

        display_addr = addr if addr else (
            str(fastbet).strip() if fastbet and not pd.isna(fastbet) and str(fastbet).strip() else None
        )

        def _safe_int(v):  return int(v)   if v is not None and not pd.isna(v) else None
        def _safe_f1(v):   return round(float(v), 1) if v is not None and not pd.isna(v) else None

        def _safe_str(v):
            s = str(v).strip() if v is not None else ""
            return s if s not in ("", "nan", "None", "<NA>") else None

        records.append({
            "coordinates":    row["coordinates"],
            "height":         round(float(row["elev"]), 1),
            "color":          row["color"],
            "floors":         _safe_f1(fl_epc),
            "year":           _safe_int(yr_epc),
            "area":           _safe_int(area),
            "footprint_m2":   _safe_f1(row.get("footprint_m2", None)),
            "energy":         _safe_f1(enrg),
            "eclass":         _safe_str(eklass),
            "eclass_color":   ECLASS_COLORS.get(_safe_str(eklass) or "", None),
            "has_epc":        bool(andamal and andamal == andamal),
            "andamal":        _safe_str(andamal),
            "use_cat":        use,
            "address":        display_addr,
            "all_addresses":  all_addr,
            "tabula_period":  _safe_str(row.get("tabula_period")),
            "tabula_u_wall":  round(float(row["tabula_u_wall"]),  2) if row.get("tabula_u_wall")  is not None and row.get("tabula_u_wall")  == row.get("tabula_u_wall")  else None,
            "tabula_u_roof":  round(float(row["tabula_u_roof"]),  2) if row.get("tabula_u_roof")  is not None and row.get("tabula_u_roof")  == row.get("tabula_u_roof")  else None,
            "tabula_u_win":   round(float(row["tabula_u_win"]),   2) if row.get("tabula_u_win")   is not None and row.get("tabula_u_win")   == row.get("tabula_u_win")   else None,
            "tabula_heat_z3": round(float(row["tabula_heat_z3"]), 1) if row.get("tabula_heat_z3") is not None and row.get("tabula_heat_z3") == row.get("tabula_heat_z3") else None,
            "tabula_wall":    _safe_str(row.get("tabula_wall")),
            "tabula_roof":    _safe_str(row.get("tabula_roof")),
            "perf_pct":       round(float(row["perf_pct"]), 3) if row.get("perf_pct") is not None and row.get("perf_pct") == row.get("perf_pct") else None,
        })

    records    = _sanitize(records)
    data_json  = json.dumps(records)

    # ── EPC footprint layer ────────────────────────────────────────────────
    print("  Building EPC footprint JSON ...")
    _epc_bbox = epc_gdf.cx[LON_MIN:LON_MAX, LAT_MIN:LAT_MAX].copy()
    _epc_bbox["geometry"] = _epc_bbox.geometry.simplify(0.00003, preserve_topology=False)
    epc_records = []
    for _, _r in _epc_bbox.iterrows():
        _g = _r.geometry
        if _g is None or _g.is_empty:
            continue
        if _g.geom_type == "MultiPolygon":
            _g = max(_g.geoms, key=lambda x: x.area)
        if _g.geom_type != "Polygon" or _g.exterior is None:
            continue
        _coords = [[round(c[0], 6), round(c[1], 6)] for c in _g.exterior.coords]
        _ek = str(_r.get("energy_class", "") or "").strip().upper()
        _ek = _ek if _ek in ("A","B","C","D","E","F","G") else None

        def _s(v):
            s = str(v).strip() if v is not None else ""
            return s if s not in ("", "nan", "None", "<NA>") else None
        def _sf(v, d=1):
            s = str(v).strip() if v is not None else ""
            if s in ("", "nan", "None", "<NA>"): return None
            try: return round(float(s), d)
            except: return None
        def _si(v):
            s = str(v).strip() if v is not None else ""
            if s in ("", "nan", "None", "<NA>"): return None
            try: return int(float(s))
            except: return None

        epc_records.append({
            "coordinates": _coords,
            "andamal":     _s(_r.get("andamal1")),
            "eclass":      _ek,
            "address":     _s(_r.get("address")),
            "energy":      _sf(_r.get("energy_kwh_m2")),
            "area":        _si(_r.get("area_atemp")),
            "year":        _si(_r.get("year_built")),
            "floors":      _sf(_r.get("floors_epc")),
            "prop_id":     _s(_r.get("fastighetsbeteckning")),
        })
    print(f"  EPC footprints for layer: {len(epc_records):,}")
    epc_json = json.dumps(epc_records)

    # ── Map centre ────────────────────────────────────────────────────────
    _gdf_proj = gdf.to_crs("EPSG:3006")
    cx = float(_gdf_proj.geometry.centroid.to_crs("EPSG:4326").x.median())
    cy = float(_gdf_proj.geometry.centroid.to_crs("EPSG:4326").y.median())

    # ── Statistics ────────────────────────────────────────────────────────
    n_total       = len(gdf)
    n_epc_matched = int(gdf["andamal1_epc"].notna().sum())
    eclass_counts = {}
    for _cls in ["A","B","C","D","E","F","G"]:
        eclass_counts[_cls] = int((gdf["energy_class"].astype(str).str.strip().str.upper() == _cls).sum())
    n_eclass_total = sum(eclass_counts.values())

    # ── Performance cards ─────────────────────────────────────────────────
    _ef = gdf[
        gdf["tabula_period"].notna() &
        gdf["energy_kwh_m2"].notna() &
        (pd.to_numeric(gdf["energy_kwh_m2"], errors="coerce") > 0)
    ].copy()
    _ef["_energy"] = pd.to_numeric(_ef["energy_kwh_m2"], errors="coerce")

    def _fmt_addr(row):
        a = row.get("address_epc", None)
        f = row.get("fastighet_epc", None)
        if a and str(a).strip() not in ("", "nan", "None"):
            return re.sub(r'\s+(LGH|lgh|ANL|LOKAL|KONTOR|GAR|P-PLATS).*$', '', str(a)).strip()
        if f and str(f).strip() not in ("", "nan", "None"):
            return str(f).strip()
        return "Unknown address"

    _ef["_addr"] = _ef.apply(_fmt_addr, axis=1)

    def _row_to_card(r):
        eklass = str(r.get("energy_class","")).strip().upper()
        if eklass in ("","NAN","NONE"): eklass = None
        yr = r.get("year_built_epc", None)
        try: yr = int(yr) if yr and not pd.isna(yr) else None
        except: yr = None
        return {
            "addr":   r["_addr"],
            "energy": round(float(r["_energy"]), 0),
            "eclass": eklass,
            "use":    r.get("use_cat","ovrigt"),
            "period": r.get("tabula_period", None),
            "year":   yr,
            "area":   int(r["area_atemp_epc"]) if r.get("area_atemp_epc") and str(r.get("area_atemp_epc")) not in ("nan","None") else None,
        }

    # Per-period cards
    period_cards_json = {}
    for _p in PERIOD_KEYS:
        _sub = _ef[_ef["tabula_period"] == _p].copy()
        if _sub.empty:
            period_cards_json[_p] = {"best": [], "worst": []}
            continue
        _sub_sorted = _sub.sort_values("_energy")
        period_cards_json[_p] = {
            "best":  [_row_to_card(r) for _, r in _sub_sorted.head(3).iterrows()],
            "worst": [_row_to_card(r) for _, r in _sub_sorted.tail(3).iloc[::-1].iterrows()],
        }
    period_cards_js = json.dumps(period_cards_json)

    # Per-energy-class cards
    eclass_cards_json = {}
    for _cls in ["A","B","C","D","E","F","G"]:
        _sub = _ef[_ef["energy_class"].astype(str).str.strip().str.upper() == _cls].copy()
        if _sub.empty:
            eclass_cards_json[_cls] = {"best": [], "worst": []}
            continue
        _sub_sorted = _sub.sort_values("_energy")
        eclass_cards_json[_cls] = {
            "best":  [_row_to_card(r) for _, r in _sub_sorted.head(3).iterrows()],
            "worst": [_row_to_card(r) for _, r in _sub_sorted.tail(3).iloc[::-1].iterrows()],
        }
    eclass_cards_js = json.dumps(eclass_cards_json)

    # Per-use-category cards
    use_cards_json = {}
    for _use in ["bostad_enfamilj","bostad_flerfamilj","verksamhet","industri","samhalle","komplement","ovrigt"]:
        _sub = _ef[_ef["use_cat"] == _use].copy()
        if _sub.empty:
            use_cards_json[_use] = {"buildings": []}
            continue
        _sub_sorted = _sub.sort_values("_energy")
        _best    = list(_sub_sorted.head(50).index)
        _worst   = list(_sub_sorted.tail(50).index)
        _combined = {i for i in _best + _worst}
        _rows = _sub_sorted.loc[_sub_sorted.index.isin(_combined)]
        use_cards_json[_use] = {"buildings": [_row_to_card(r) for _, r in _rows.iterrows()]}
    use_cards_js = json.dumps(use_cards_json)

    # Per-period energy summary stats
    period_stats = {}
    for _p in PERIOD_KEYS:
        _sub = gdf[gdf["tabula_period"] == _p]
        _energies = pd.to_numeric(_sub["energy_kwh_m2"], errors="coerce").dropna()
        period_stats[_p] = {
            "count":      int(len(_sub)),
            "median_kwh": round(float(_energies.median()), 0) if len(_energies) else None,
        }
    period_stats_js = json.dumps(period_stats)

    print(f"  Done: {n_total:,} buildings, {n_epc_matched:,} EPC-matched, {n_eclass_total:,} energy-classified")

    return {
        "records":         records,          # Python list — for buildings.json
        "records_json":    data_json,        # JSON string — for DATA const in HTML
        "epc_json":        epc_json,         # JSON string — EPC footprint layer
        "period_cards_js": period_cards_js,
        "eclass_cards_js": eclass_cards_js,
        "use_cards_js":    use_cards_js,
        "period_stats_js": period_stats_js,
        "cx":              cx,
        "cy":              cy,
        "n_total":         n_total,
        "n_epc_matched":   n_epc_matched,
        "n_eclass_total":  n_eclass_total,
    }
