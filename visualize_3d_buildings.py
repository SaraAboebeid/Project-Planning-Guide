"""
visualize_3d_buildings.py — backward-compatibility wrapper.
The build logic has been split into:
    data_pipeline.py   — all Python data processing
    build.py           — assembler: reads viewer/ source files → assets/gothenburg_3d.html
    viewer/styles/main.css
    viewer/index.html
    viewer/js/legend.js
    viewer/js/cesium.js
    viewer/js/ui.js
    viewer/js/pvgis.js
    viewer/js/facade_inspector.js
    viewer/js/search.js

To regenerate the HTML, run either:
    python build.py              (new entry point)
    python visualize_3d_buildings.py  (this file — same result)
"""
# ruff: noqa
from build import main
if __name__ == "__main__":
    main()
  raise SystemExit(0)

# ── Legacy code kept below for reference only. Do NOT edit here. ──────────
# Edit viewer/styles/main.css, viewer/index.html, viewer/js/*.js instead.
# The data pipeline lives in data_pipeline.py.
# ─────────────────────────────────────────────────────────────────────────

import geopandas as gpd
import pandas as pd
import numpy as np
import json
import os
from pathlib import Path

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
_LEGACY_EUBUCCO_DIR = Path(os.environ.get("EUBUCCO_DATA_DIR", str(Path(__file__).resolve().parent / "data" / "eubucco"))).expanduser()
PARQUET_PATH = str(_LEGACY_EUBUCCO_DIR / "SE23.parquet")
GPKG_PATH = str(_LEGACY_EUBUCCO_DIR / "SE23.gpkg")
OUTPUT_HTML  = "assets/gothenburg_3d.html"

# Central Gothenburg bounding box (EPSG:4326)
# Tight city-centre crop keeps the dataset to a manageable browser size (~80-120k buildings)
LON_MIN, LON_MAX = 11.85, 12.10
LAT_MIN, LAT_MAX = 57.62, 57.80

# EPC-based building use colour palette (R, G, B, A)
# Derived from footprints.andamal1 categories (Swedish building register)
USE_COLORS = {
    "bostad_enfamilj":   [255, 165,  50, 210],   # warm orange  – single/semi-detached
    "bostad_flerfamilj": [255, 210,  60, 210],   # yellow-orange – multi-family
    "verksamhet":        [ 70, 180, 255, 210],   # sky blue      – commercial/offices
    "industri":          [200,  80,  60, 210],   # brick red     – industrial
    "samhalle":          [ 70, 210, 140, 210],   # teal green    – public/civic
    "komplement":        [140, 140, 160, 180],   # muted grey    – outbuildings/garages
    "ovrigt":            [160, 120, 200, 180],   # lavender      – other/unknown
}

USE_LABELS = {
    "bostad_enfamilj":   "Residential – single family",
    "bostad_flerfamilj": "Residential – multi-family",
    "verksamhet":        "Commercial / office",
    "industri":          "Industrial",
    "samhalle":          "Public / civic",
    "komplement":        "Outbuilding / garage",
    "ovrigt":            "Other / unknown",
}

# Energy class colour palette (EPC A–G scale)
ECLASS_COLORS = {
    "A": [ 22, 163,  74, 230],   # vivid green
    "B": [ 74, 222, 128, 220],   # light green
    "C": [190, 242,  60, 210],   # yellow-green
    "D": [250, 204,  21, 215],   # yellow
    "E": [251, 146,  60, 220],   # orange
    "F": [239,  68,  68, 225],   # red
    "G": [153,  27,  27, 230],   # dark red
}

import unicodedata

def _norm(s: str) -> str:
    """Fold Swedish å/ä/ö → a/a/o so plain ASCII substrings match."""
    return unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode("ascii").lower()

def andamal_to_use(andamal: str) -> str:
    """Map EPC andamal1 string to a colour category key."""
    if not isinstance(andamal, str):
        return "ovrigt"
    a = _norm(andamal)
    # Outbuildings / garages first (often attached to residential)
    if "komplement" in a or "ekonomi" in a:
        return "komplement"
    # Multi-family before generic 'bostad'
    if "flerfamilj" in a or "flerbostad" in a or "hyreshus" in a:
        return "bostad_flerfamilj"
    # Single/semi-detached residential
    if "bostad" in a or "smahus" in a or "radhus" in a or "kedjehus" in a:
        return "bostad_enfamilj"
    # Commercial / offices
    if "verksamhet" in a or "handel" in a or "kontor" in a or "hotell" in a or "restaurang" in a:
        return "verksamhet"
    # Industrial
    if "industri" in a or "tillverkning" in a or "lager" in a:
        return "industri"
    # Public / civic  (samhallsfunktion after normalization, skola, vard, etc.)
    if ("samhall" in a or "skola" in a or "vard" in a
            or "samfund" in a or "offentlig" in a or "special" in a
            or "idrott" in a or "bad" in a or "kultur" in a):
        return "samhalle"
    return "ovrigt"

# ---------------------------------------------------------------------------
# Load data
# ---------------------------------------------------------------------------
print("Loading building data …")
src = PARQUET_PATH if os.path.exists(PARQUET_PATH) else GPKG_PATH
gdf = gpd.read_parquet(src) if src.endswith(".parquet") else gpd.read_file(src)
print(f"  Loaded {len(gdf):,} buildings  CRS={gdf.crs}")

# ---------------------------------------------------------------------------
# Reproject to WGS-84 (deck.gl requires lng/lat)
# ---------------------------------------------------------------------------
if gdf.crs and gdf.crs.to_epsg() != 4326:
    print("  Reprojecting to EPSG:4326 …")
    gdf = gdf.to_crs("EPSG:4326")

# ---------------------------------------------------------------------------
# Spatial crop to central Gothenburg
# ---------------------------------------------------------------------------
print(f"  Filtering to central Gothenburg bbox …")
gdf = gdf.cx[LON_MIN:LON_MAX, LAT_MIN:LAT_MAX].copy()
print(f"  {len(gdf):,} buildings in crop area")

# ---------------------------------------------------------------------------
# Join EPC footprints → get building use (andamal1) via spatial join
# NOTE: must happen BEFORE simplification so original polygon boundaries are used
# ---------------------------------------------------------------------------
import duckdb
from shapely import wkb as shapely_wkb

print("Loading EPC footprints for building use …")
con = duckdb.connect("data/sensitivity/epc_sweden.duckdb", read_only=True)
epc_raw = con.execute("""
    -- One row per footprint polygon, with the most specific address for that unit.
    -- If footprint.husnummer matches an EPC row's IdHusnr, use that address;
    -- otherwise fall back to MIN(IdAdr) across the whole FormularId.
    SELECT
        f.FormularId,
        f.geom,
        f.andamal1,
        f.fastighetsbeteckning,
        e_agg.year_built,
        e_agg.floors_epc,
        e_agg.area_atemp,
        e_agg.energy_kwh_m2,
        e_agg.energy_class,
        COALESCE(
            MIN(CASE WHEN TRY_CAST(f.husnummer AS BIGINT) = e.IdHusnr
                          THEN TRIM(e.IdAdr) END),
            e_agg.address
        ) AS address
    FROM footprints f
    LEFT JOIN epc e ON f.FormularId = e.FormularId
                    AND e.IdAdr IS NOT NULL
                    AND TRIM(e.IdAdr) != ''
    LEFT JOIN (
        SELECT
            FormularId,
            MIN(EgenNybyggAr)                   AS year_built,
            MIN(EgenAntalPlan)                  AS floors_epc,
            MIN(EgenAtemp)                      AS area_atemp,
            MIN(EgiSpecifikEnergianvandning)     AS energy_kwh_m2,
            MIN(EgiEnergiklass)                 AS energy_class,
            MIN(IdAdr)                          AS address
        FROM epc
        WHERE IdAdr IS NOT NULL AND TRIM(IdAdr) != ''
        GROUP BY FormularId
    ) e_agg ON f.FormularId = e_agg.FormularId
    WHERE f.geom IS NOT NULL
    GROUP BY f.FormularId, f.objektidentitet, f.geom,
             f.andamal1, f.fastighetsbeteckning, f.husnummer,
             e_agg.year_built, e_agg.floors_epc, e_agg.area_atemp,
             e_agg.energy_kwh_m2, e_agg.energy_class, e_agg.address
""").fetchdf()
con.close()

epc_raw["geometry"] = epc_raw["geom"].apply(lambda b: shapely_wkb.loads(bytes(b)))
epc_cols = ["FormularId", "andamal1", "fastighetsbeteckning", "year_built", "floors_epc", "area_atemp", "energy_kwh_m2", "energy_class", "address", "geometry"]
epc_gdf = gpd.GeoDataFrame(epc_raw[epc_cols], crs="EPSG:4326")

# Project both datasets to EPSG:3006 (metric CRS) for accurate distance matching
epc_3006 = epc_gdf.to_crs("EPSG:3006")
gdf_3006 = gdf.to_crs("EPSG:3006")

# Crop EPC polygons to bbox (with small buffer for edge buildings)
bbox_poly = gpd.GeoDataFrame(
    geometry=gpd.GeoSeries.from_wkt(
        [f"POLYGON(({LON_MIN} {LAT_MIN},{LON_MAX} {LAT_MIN},{LON_MAX} {LAT_MAX},{LON_MIN} {LAT_MAX},{LON_MIN} {LAT_MIN}))"]
    ), crs="EPSG:4326"
).to_crs("EPSG:3006").geometry.iloc[0]
epc_polys = epc_3006[epc_3006.geometry.intersects(bbox_poly.buffer(200))].copy()
print(f"  EPC footprints in bbox: {len(epc_polys):,}")

# Use EPC polygon centroids for reliable nearest-neighbour matching
# (individual footprints are ~88 m² — too small for "within" predicate)
epc_cents = epc_polys.copy()
epc_cents["geometry"] = epc_polys.geometry.centroid

# EUBUCCO centroids — used as query points
gdf_3006_pts = gdf_3006.copy()
gdf_3006_pts = gdf_3006_pts.reset_index().rename(columns={"index": "eubucco_idx"})
gdf_3006_pts["geometry"] = gdf_3006_pts["geometry"].centroid
gdf_3006_pts = gdf_3006_pts[["eubucco_idx", "geometry"]]

# Single nearest-neighbour pass: each EUBUCCO building → nearest EPC footprint centroid
MAX_DIST_M = 30  # metres — tight enough to avoid cross-street mismatches
joined_nearest = gpd.sjoin_nearest(
    gdf_3006_pts, epc_cents,
    how="left", max_distance=MAX_DIST_M, distance_col="dist_m"
)
# One EPC footprint per EUBUCCO building — keep closest
joined = joined_nearest.sort_values("dist_m").drop_duplicates("eubucco_idx")

# Per EUBUCCO building: aggregate — mode for categorical, median for numeric
def _mode(x):
    vc = x.dropna().value_counts()
    return vc.index[0] if len(vc) else None
def _med(x):   v = pd.to_numeric(x, errors="coerce").dropna(); return round(float(v.median()), 1) if len(v) else None

agg = joined.groupby("eubucco_idx").agg(
    andamal1_epc   =("andamal1",              _mode),
    fastighet_epc  =("fastighetsbeteckning",  _mode),
    year_built_epc =("year_built",            _med),
    floors_epc     =("floors_epc",            _med),
    area_atemp_epc =("area_atemp",            _med),
    energy_kwh_m2  =("energy_kwh_m2",         _med),
    energy_class   =("energy_class",          _mode),
    address_epc    =("address",               _mode),
    formular_id    =("FormularId",            _mode),
)
gdf = gdf.join(agg)
matched = gdf["andamal1_epc"].notna().sum()

# Assign use category NOW so TABULA matching can use it
gdf["use_cat"] = gdf["andamal1_epc"].apply(andamal_to_use)

# ---------------------------------------------------------------------------
# TABULA archetype matching by construction year
# Loads both JSON files directly (no streamlit dependency needed here)
# ---------------------------------------------------------------------------
_TABULA_DIR = Path("data/sensitivity/FW_ Map selection in notebook")

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

print("Loading TABULA archetypes …")
_tabula_lookup = _load_tabula_lookup()
print(f"  {len(_tabula_lookup)} TABULA archetypes loaded")

TABULA_PERIODS = ["...1960", "1961-1975", "1976-1985", "1986-1995", "1996-2005"]

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

def _tabula_match(year, use_cat):
    period = _year_to_period(year)
    btype  = _use_to_btype(use_cat)
    if not period or not btype or period == "post-2005":
        return None, period
    return _tabula_lookup.get((btype, period)), period

print("  Matching buildings to TABULA archetypes …")
_tabula_rows = []
for _, _row in gdf.iterrows():
    _arch, _period = _tabula_match(_row.get("year_built_epc"), _row.get("use_cat"))
    _tabula_rows.append({
        "tabula_period":  _period,
        "tabula_u_wall":  _arch["u_wall"]       if _arch else None,
        "tabula_u_roof":  _arch["u_roof"]       if _arch else None,
        "tabula_u_win":   _arch["u_window"]     if _arch else None,
        "tabula_heat_z3": _arch["heat_z3"]      if _arch else None,
        "tabula_wall":    _arch["constr_wall"]  if _arch else None,
        "tabula_roof":    _arch["constr_roof"]  if _arch else None,
    })
_tabula_df = pd.DataFrame(_tabula_rows, index=gdf.index)
gdf = pd.concat([gdf, _tabula_df], axis=1)
n_tab = gdf["tabula_period"].notna().sum()
print(f"  TABULA matched: {n_tab:,} of {len(gdf):,} buildings ({n_tab/len(gdf)*100:.1f}%)")
for _p in TABULA_PERIODS + ["post-2005"]:
    _c = (gdf["tabula_period"] == _p).sum()
    if _c: print(f"    {_p}: {_c:,}")

# Compute within-period energy performance percentile
# 0.0 = best performer (lowest kWh/m²) for that era
# 1.0 = worst performer (highest kWh/m²) for that era
# NaN  = no energy data available
print("  Computing within-period energy performance percentiles …")
gdf["perf_pct"] = np.nan
for _p in TABULA_PERIODS + ["post-2005"]:
    _mask = (gdf["tabula_period"] == _p) & pd.to_numeric(gdf["energy_kwh_m2"], errors="coerce").notna()
    if _mask.sum() < 2:
        continue
    _vals = pd.to_numeric(gdf.loc[_mask, "energy_kwh_m2"], errors="coerce")
    _min, _max = _vals.quantile(0.02), _vals.quantile(0.98)  # clip outliers
    if _max > _min:
        gdf.loc[_mask, "perf_pct"] = ((_vals - _min) / (_max - _min)).clip(0, 1)
    else:
        gdf.loc[_mask, "perf_pct"] = 0.5
has_perf = gdf["perf_pct"].notna().sum()
print(f"  Energy compare data: {has_perf:,} buildings with within-period ranking")
n_matched = joined["andamal1"].notna().sum()
print(f"  Matched {matched:,} of {len(gdf):,} buildings to EPC use ({matched/len(gdf)*100:.1f}%)")
print(f"  (nearest <={MAX_DIST_M}m: {n_matched:,} EPC pts matched)")
print(f"  Top andamal1 values:")
print(joined["andamal1"].value_counts().head(10).to_string())

# ---------------------------------------------------------------------------
# Compute footprint area from the ORIGINAL (un-simplified) polygon
# Must happen before simplification so the area is accurate
# ---------------------------------------------------------------------------
print("  Computing footprint areas from original EUBUCCO polygons …")
gdf_3006_fp = gdf.to_crs("EPSG:3006")
gdf["footprint_m2"] = gdf_3006_fp.geometry.area.round(1)
print(f"  Footprint area stats: mean={gdf['footprint_m2'].mean():.0f} m²  median={gdf['footprint_m2'].median():.0f} m²  max={gdf['footprint_m2'].max():.0f} m²")

# ---------------------------------------------------------------------------
# Simplify geometries to reduce HTML file size (AFTER EPC + TABULA join)
# ---------------------------------------------------------------------------
print("  Simplifying geometries …")
gdf["geometry"] = gdf["geometry"].simplify(tolerance=0.00005, preserve_topology=True)

# ---------------------------------------------------------------------------
# Prepare extrusion height from EUBUCCO
# Primary: 'height' field (metres, 100% coverage in SE23)
# Fallback: floors * 3.2m (typical Swedish storey height)
# ---------------------------------------------------------------------------
print("  Processing heights from EUBUCCO …")
gdf["elev"] = pd.to_numeric(gdf["height"], errors="coerce").clip(lower=0)
# Fill any rare nulls with floors * 3.2
fl = pd.to_numeric(gdf["floors"], errors="coerce")
null_mask = gdf["elev"].isna() | (gdf["elev"] == 0)
gdf.loc[null_mask, "elev"] = fl[null_mask] * 3.2
gdf["elev"] = gdf["elev"].fillna(3.2)  # absolute fallback: 1-storey

# Hard cap at 100m — tallest building in Gothenburg is ~86m (Gothia Towers).
# Anything above is a EUBUCCO data error (bridges, cranes, etc.)
outliers = (gdf["elev"] > 100).sum()
if outliers:
    print(f"  Capping {outliers} height outlier(s) >100m (max was {gdf['elev'].max():.0f}m)")
gdf["elev"] = gdf["elev"].clip(upper=100)
print(f"  Height stats: mean={gdf['elev'].mean():.1f}m  median={gdf['elev'].median():.1f}m  "
      f"p99={gdf['elev'].quantile(0.99):.1f}m  max={gdf['elev'].max():.0f}m")
print(f"  Zero/null heights remaining: {(gdf['elev']==0).sum()}")

# ---------------------------------------------------------------------------
# Building use colour (from EPC join)
# ---------------------------------------------------------------------------
print("  Use category distribution:")
print(gdf["use_cat"].value_counts().to_string())
gdf["color"] = gdf["use_cat"].apply(lambda c: USE_COLORS.get(c, USE_COLORS["ovrigt"]))

# ---------------------------------------------------------------------------
# Convert polygons → coordinate ring lists for deck.gl
# ---------------------------------------------------------------------------
print("  Converting geometries to coordinate rings …")

def geom_to_coords(geom):
    """Return list of [lng, lat] rings. Handles Polygon and MultiPolygon.
    Coordinates are rounded to 6 decimal places (~0.1m precision) to reduce file size."""
    if geom is None or geom.is_empty:
        return None
    if geom.geom_type == "Polygon":
        return [[[round(x, 6), round(y, 6)] for x, y in geom.exterior.coords]]
    elif geom.geom_type == "MultiPolygon":
        biggest = max(geom.geoms, key=lambda p: p.area)
        return [[[round(x, 6), round(y, 6)] for x, y in biggest.exterior.coords]]
    return None

gdf["coordinates"] = gdf["geometry"].apply(geom_to_coords)
gdf = gdf[gdf["coordinates"].notna()].copy()
print(f"  {len(gdf):,} valid buildings after geometry conversion")

# ---------------------------------------------------------------------------
# Build JSON records for deck.gl
# ---------------------------------------------------------------------------
print("  Building JSON payload …")
records = []
for _, row in gdf.iterrows():
    # EUBUCCO fields
    btype = row.get("type", None)
    # EPC fields
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
    # Strip apartment suffix from primary address
    if addr and addr == addr:
        import re
        addr = re.sub(r'\s+(LGH|lgh|ANL|LOKAL|KONTOR|GAR|P-PLATS).*$', '', str(addr)).strip()
    else:
        addr = None
    # Clean all_addresses
    if all_addr and all_addr == all_addr and str(all_addr).strip() not in ('', 'nan', 'None'):
        import re as _re
        all_addr = _re.sub(r'\s+(LGH|lgh|ANL|LOKAL|KONTOR|GAR|P-PLATS)[^,]*', '', str(all_addr)).strip(', ')
    else:
        all_addr = None
    # Fallback to fastighetsbeteckning if no street address
    display_addr = addr if addr else (str(fastbet).strip() if fastbet and not pd.isna(fastbet) and str(fastbet).strip() else None)
    def _safe_int(v):  return int(v) if v is not None and not pd.isna(v) else None
    def _safe_f1(v):   return round(float(v), 1) if v is not None and not pd.isna(v) else None
    records.append({
        "coordinates": row["coordinates"],
        "height":      round(float(row["elev"]), 1),
        "color":       row["color"],
        "floors":      _safe_f1(fl_epc),
        "year":        _safe_int(yr_epc),
        "area":        _safe_int(area),
        "footprint_m2": _safe_f1(row.get("footprint_m2", None)),
        "energy":      _safe_f1(enrg),
        "eclass":      str(eklass) if eklass and eklass == eklass else None,
        "eclass_color": ECLASS_COLORS.get(str(eklass).strip().upper(), None) if eklass and eklass == eklass else None,
        "has_epc":     bool(andamal and andamal == andamal),
        "andamal":     str(andamal) if andamal and andamal == andamal else None,
        "use_cat":     use,
        "address":     display_addr,
        "all_addresses": all_addr,
        "tabula_period":  str(row["tabula_period"]) if row.get("tabula_period") is not None and row.get("tabula_period") == row.get("tabula_period") and str(row.get("tabula_period")) not in ('nan','None','') else None,
        "tabula_u_wall":  round(float(row["tabula_u_wall"]),  2) if row.get("tabula_u_wall")  is not None and row.get("tabula_u_wall")  == row.get("tabula_u_wall")  else None,
        "tabula_u_roof":  round(float(row["tabula_u_roof"]),  2) if row.get("tabula_u_roof")  is not None and row.get("tabula_u_roof")  == row.get("tabula_u_roof")  else None,
        "tabula_u_win":   round(float(row["tabula_u_win"]),   2) if row.get("tabula_u_win")   is not None and row.get("tabula_u_win")   == row.get("tabula_u_win")   else None,
        "tabula_heat_z3": round(float(row["tabula_heat_z3"]), 1) if row.get("tabula_heat_z3") is not None and row.get("tabula_heat_z3") == row.get("tabula_heat_z3") else None,
        "tabula_wall":    str(row["tabula_wall"]) if row.get("tabula_wall") and row.get("tabula_wall") == row.get("tabula_wall") else None,
        "tabula_roof":    str(row["tabula_roof"]) if row.get("tabula_roof") and row.get("tabula_roof") == row.get("tabula_roof") else None,
        "perf_pct":       round(float(row["perf_pct"]), 3) if row.get("perf_pct") is not None and row.get("perf_pct") == row.get("perf_pct") else None,
    })

# Sanitize NaN/Inf → None before embedding in HTML (json.dumps allows NaN by default which breaks JS)
def _sanitize_for_html(obj):
    if isinstance(obj, float) and (obj != obj or obj == float("inf") or obj == float("-inf")):
        return None
    if isinstance(obj, dict):
        return {k: _sanitize_for_html(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_sanitize_for_html(v) for v in obj]
    return obj

records = _sanitize_for_html(records)
data_json = json.dumps(records)

# ---------------------------------------------------------------------------
# Build EPC footprint layer (flat polygons colored by energy class)
# ---------------------------------------------------------------------------
print("  Building EPC footprint JSON …")
_epc_bbox = epc_gdf.cx[LON_MIN:LON_MAX, LAT_MIN:LAT_MAX].copy()
# Merge energy_class from EPC table into footprints gdf
_epc_bbox = _epc_bbox.join(
    gdf[["energy_class", "address_epc", "andamal1_epc"]]
    .rename(columns={"andamal1_epc": "andamal1_merged"})
    .dropna(subset=["energy_class"]),
    how="left"
) if False else _epc_bbox  # skip join — energy_class already in epc_gdf via FormularId
# Simplify geometries (tolerance ~2m in degrees at this latitude)
_epc_bbox["geometry"] = _epc_bbox.geometry.simplify(0.00003, preserve_topology=False)
epc_records = []
for _, _r in _epc_bbox.iterrows():
    _g = _r.geometry
    if _g is None or _g.is_empty:
        continue
    # Take largest sub-polygon for MultiPolygon
    if _g.geom_type == "MultiPolygon":
        _g = max(_g.geoms, key=lambda x: x.area)
    if _g.geom_type != "Polygon" or _g.exterior is None:
        continue
    _coords = [[round(c[0], 6), round(c[1], 6)] for c in _g.exterior.coords]
    _ek = str(_r.get("energy_class", "") or "").strip().upper()
    _ek = _ek if _ek in ("A","B","C","D","E","F","G") else None
    def _safe(v):
        s = str(v).strip() if v is not None else ""
        return s if s not in ("", "nan", "None", "<NA>") else None
    def _safe_float(v, digits=1):
        s = str(v).strip() if v is not None else ""
        if s in ("", "nan", "None", "<NA>"):
            return None
        try:
            return round(float(s), digits)
        except (ValueError, TypeError):
            return None
    def _safe_int(v):
        s = str(v).strip() if v is not None else ""
        if s in ("", "nan", "None", "<NA>"):
            return None
        try:
            return int(float(s))
        except (ValueError, TypeError):
            return None
    epc_records.append({
        "coordinates": _coords,
        "andamal": _safe(_r.get("andamal1")),
        "eclass": _ek,
        "address": _safe(_r.get("address")),
        "energy": _safe_float(_r.get("energy_kwh_m2"), 1),
        "area": _safe_int(_r.get("area_atemp")),
        "year": _safe_int(_r.get("year_built")),
        "floors": _safe_float(_r.get("floors_epc"), 1),
        "prop_id": _safe(_r.get("fastighetsbeteckning")),
    })
print(f"  EPC footprints for layer: {len(epc_records):,}")
epc_json = json.dumps(epc_records)

# ---------------------------------------------------------------------------
# Compute map centre
# ---------------------------------------------------------------------------
_gdf_proj = gdf.to_crs("EPSG:3006")
cx = _gdf_proj.geometry.centroid.to_crs("EPSG:4326").x.median()
cy = _gdf_proj.geometry.centroid.to_crs("EPSG:4326").y.median()

# ---------------------------------------------------------------------------
# Statistics for legend
# ---------------------------------------------------------------------------
n_total    = len(gdf)
use_counts = gdf["use_cat"].value_counts().to_dict()
n_epc_matched = int(gdf["andamal1_epc"].notna().sum())
n_eclass      = int(pd.to_numeric(gdf["energy_class"].replace('nan', None), errors='coerce').isna().sum())
n_with_eclass = n_epc_matched - n_eclass

# Energy class counts for legend
eclass_counts = {}
for _cls in ["A","B","C","D","E","F","G"]:
    eclass_counts[_cls] = int((gdf["energy_class"].astype(str).str.strip().str.upper() == _cls).sum())
n_eclass_total = sum(eclass_counts.values())

ECLASS_LABELS = {
    "A": "A – Very efficient",
    "B": "B – Efficient",
    "C": "C – Above average",
    "D": "D – Average",
    "E": "E – Below average",
    "F": "F – Poor",
    "G": "G – Very poor",
}
eclass_legend_html = ""
for _cls, _lbl in ECLASS_LABELS.items():
    _r, _g, _b, _ = ECLASS_COLORS[_cls]
    _cnt = eclass_counts.get(_cls, 0)
    eclass_legend_html += f"""
      <div style="display:flex;align-items:center;gap:6px;margin:5px 0">
        <div style="width:12px;height:12px;border-radius:3px;background:rgb({_r},{_g},{_b});flex-shrink:0"></div>
        <span>{_lbl}</span>
        <span style="margin-left:auto;color:#64748b">{_cnt:,}</span>
      </div>"""

type_legend_html = ""
for key, label in USE_LABELS.items():
    r, g, b, _ = USE_COLORS[key]
    cnt = use_counts.get(key, 0)
    pct = cnt / n_total * 100 if n_total else 0
    type_legend_html += f"""
      <div style="display:flex;align-items:center;gap:6px;margin:5px 0">
        <div style="width:12px;height:12px;border-radius:3px;background:rgb({r},{g},{b});flex-shrink:0"></div>
        <span>{label}</span>
        <span style="margin-left:auto;color:#64748b">{cnt:,}</span>
      </div>"""

# ---------------------------------------------------------------------------
# Per-period energy extremes: top-3 best (lowest kWh) + worst (highest kWh)
# Only for buildings that have: tabula_period, energy, address/fastighet, use_cat
# ---------------------------------------------------------------------------
PERIOD_KEYS = ['...1960','1961-1975','1976-1985','1986-1995','1996-2005','post-2005']
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
        import re as _re
        return _re.sub(r'\s+(LGH|lgh|ANL|LOKAL|KONTOR|GAR|P-PLATS).*$', '', str(a)).strip()
    if f and str(f).strip() not in ("", "nan", "None"):
        return str(f).strip()
    return "Unknown address"

_ef["_addr"] = _ef.apply(_fmt_addr, axis=1)

period_cards_json = {}
for _p in PERIOD_KEYS:
    _sub = _ef[_ef["tabula_period"] == _p].copy()
    if _sub.empty:
        period_cards_json[_p] = {"best": [], "worst": []}
        continue
    _sub_sorted = _sub.sort_values("_energy")
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
    period_cards_json[_p] = {
        "best":  [_row_to_card(r) for _, r in _sub_sorted.head(3).iterrows()],
        "worst": [_row_to_card(r) for _, r in _sub_sorted.tail(3).iloc[::-1].iterrows()],
    }

import json as _json
period_cards_js = _json.dumps(period_cards_json)

# Per-energy-class performance extremes
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
eclass_cards_js = _json.dumps(eclass_cards_json)

# Per-use-category: top-50 best + top-50 worst (for sortable table)
use_cards_json = {}
for _use in ["bostad_enfamilj","bostad_flerfamilj","verksamhet","industri","samhalle","komplement","ovrigt"]:
    _sub = _ef[_ef["use_cat"] == _use].copy()
    if _sub.empty:
        use_cards_json[_use] = {"buildings": []}
        continue
    _sub_sorted = _sub.sort_values("_energy")
    # Take best 50 + worst 50, deduplicated
    _best  = list(_sub_sorted.head(50).index)
    _worst = list(_sub_sorted.tail(50).index)
    _combined = {i for i in _best + _worst}
    _rows = _sub_sorted.loc[_sub_sorted.index.isin(_combined)]
    use_cards_json[_use] = {"buildings": [_row_to_card(r) for _, r in _rows.iterrows()]}
use_cards_js = _json.dumps(use_cards_json)

# Per-year-era summary stats for legend
period_stats = {}
for _p in PERIOD_KEYS:
    _sub = gdf[gdf["tabula_period"] == _p]
    _energies = pd.to_numeric(_sub["energy_kwh_m2"], errors="coerce").dropna()
    period_stats[_p] = {
        "count": int(len(_sub)),
        "median_kwh": round(float(_energies.median()), 0) if len(_energies) else None,
    }
period_stats_js = _json.dumps(period_stats)

# No-EPC count
n_no_epc = int(gdf["andamal1_epc"].isna().sum())

# ---------------------------------------------------------------------------
# Generate HTML
# ---------------------------------------------------------------------------
print("  Writing HTML …")

html = f"""<!DOCTYPE html>
<html>
<head>
  <title>Gothenburg 3D – Facade Inspector</title>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/cesium@1.143.0/Build/Cesium/Widgets/widgets.css">
  <script>window.CESIUM_BASE_URL = 'https://cdn.jsdelivr.net/npm/cesium@1.143.0/Build/Cesium/';</script>
  <script src="https://cdn.jsdelivr.net/npm/cesium@1.143.0/Build/Cesium/Cesium.js"></script>
  <style>
    :root {{
      --navy:    #721CB8; --navy-dark:#421869; --teal:#995BD5;
      --lime:    #509724; --green:#509724;
      --surface: rgba(248,250,252,0.97); --border:rgba(114,28,184,0.25);
      --text:    #1e293b; --muted:#64748b; --faint:#94a3b8;
      --radius:  14px;   --shadow:0 8px 40px rgba(0,0,0,0.18);
    }}
    * {{ margin:0; padding:0; box-sizing:border-box; }}
    body {{ font-family:'Inter',system-ui,sans-serif; background:#0f1117; color:var(--text); overflow:hidden; }}
    #cesium-container {{ position:fixed; inset:0; width:100vw; height:100vh; }}

    /* ─── panels ─── */
    .panel {{
      position:absolute; z-index:20;
      background:var(--surface); backdrop-filter:blur(16px);
      border:1px solid var(--border); border-radius:var(--radius);
      padding:14px 16px; box-shadow:var(--shadow);
    }}
    .panel h2 {{
      font-size:11px; font-weight:700; color:var(--lime);
      text-transform:uppercase; letter-spacing:.7px; margin-bottom:4px;
    }}
    .panel .sub {{ font-size:11px; color:var(--muted); margin-bottom:10px; }}

    /* ─── Left sidebar ─── */
    #left-panel {{
      position:absolute; top:16px; left:16px; bottom:16px; width:256px;
      z-index:20; background:var(--surface); backdrop-filter:blur(16px);
      border:1px solid var(--border); border-radius:var(--radius);
      box-shadow:var(--shadow); display:flex; flex-direction:column; overflow:hidden;
    }}
    #lp-header {{
      background:linear-gradient(135deg,#421869 0%,#721CB8 100%);
      padding:14px 14px 12px; flex-shrink:0;
    }}
    .lp-title {{ display:block; font-size:15px; font-weight:700; color:#fff; letter-spacing:.2px; }}
    .lp-sub   {{ display:block; font-size:10px; color:rgba(255,255,255,0.6); margin-top:3px; }}
    #lp-stats {{
      display:grid; grid-template-columns:1fr 1fr; gap:6px; padding:10px 10px 0; flex-shrink:0;
    }}
    .stat-box {{
      background:rgba(0,0,0,0.04); border-radius:8px; padding:8px 6px; text-align:center;
    }}
    .stat-num   {{ font-size:17px; font-weight:700; color:#a78bfa; }}
    .stat-num-2 {{ color:#22c55e; }}
    .stat-lbl   {{ font-size:9px; color:var(--muted); margin-top:2px; line-height:1.3; }}
    #lp-tabs {{ display:flex; gap:4px; padding:10px 10px 0; flex-shrink:0; }}
    .lp-tab {{
      flex:1; padding:5px 3px; border-radius:7px; border:1px solid var(--border);
      background:transparent; color:var(--muted); font-size:10px; font-weight:500;
      cursor:pointer; transition:all .15s; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
    }}
    .lp-tab:hover  {{ background:rgba(114,28,184,0.2); color:var(--text); }}
    .lp-tab.active {{ background:rgba(114,28,184,0.5); border-color:#a78bfa; color:#a78bfa; }}
    #legend-container {{
      flex:1; overflow-y:auto; padding:10px 10px 0; min-height:0;
    }}
    #legend-container::-webkit-scrollbar {{ width:4px; }}
    #legend-container::-webkit-scrollbar-track {{ background:transparent; }}
    #legend-container::-webkit-scrollbar-thumb {{ background:rgba(114,28,184,0.3); border-radius:2px; }}
    .lp-hint {{ padding:5px 10px 0; font-size:10px; color:var(--faint); flex-shrink:0; }}
    .lp-divider {{ height:1px; background:var(--border); margin:10px 10px 0; flex-shrink:0; }}
    .lp-section-title {{
      padding:7px 10px 3px; font-size:9px; font-weight:700;
      color:var(--faint); text-transform:uppercase; letter-spacing:.7px; flex-shrink:0;
    }}
    #lp-options {{ padding:0 10px 12px; display:flex; flex-direction:column; gap:5px; flex-shrink:0; }}
    .opt-btn {{ width:100%; text-align:left; font-size:11px !important; padding:6px 10px !important; }}
    .tool-btn {{
      width:100%; text-align:left; font-size:11px; padding:6px 10px;
      border-radius:8px; border:1px solid var(--border);
      background:var(--surface); color:var(--text); cursor:pointer; transition:all .15s;
      font-weight:500; font-family:inherit;
    }}
    .tool-btn:hover:not(:disabled) {{ background:rgba(114,28,184,0.35); border-color:#7c3aed; }}
    .tool-btn:disabled {{ opacity:0.38; cursor:not-allowed; }}
    .tool-btn.pvgis-btn {{
      background:rgba(245,158,11,0.1);
      border-color:rgba(245,158,11,0.35); color:#fbbf24;
    }}
    .tool-btn.pvgis-btn:hover:not(:disabled) {{ background:rgba(245,158,11,0.25); border-color:#f59e0b; }}
    #pvgis-result {{
      margin-top:4px; padding:8px;
      background:rgba(245,158,11,0.08); border:1px solid rgba(245,158,11,0.25);
      border-radius:6px; font-size:11px; line-height:1.6; display:none;
    }}
    #lp-no-selection {{
      font-size:10px; color:var(--faint); display:none; padding:2px 0;
    }}
    /* buttons */
    .btn {{
      padding:7px 14px; border-radius:10px; border:1px solid var(--border);
      background:var(--surface); color:var(--text); font-size:12px; font-weight:500;
      cursor:pointer; backdrop-filter:blur(12px); transition:all .15s; white-space:nowrap;
    }}
    .btn:hover {{ background:rgba(114,28,184,0.35); border-color:#7c3aed; }}
    .btn.active {{ background:rgba(114,28,184,0.5); border-color:#a78bfa; color:#a78bfa; }}

    /* building info panel */
    #info-panel {{
      top:16px; right:16px; width:270px; display:none;
    }}
    #info-panel .close-btn {{
      position:absolute; top:10px; right:12px; background:none; border:none;
      color:var(--muted); cursor:pointer; font-size:16px; line-height:1;
    }}
    .tt-row {{ display:flex; justify-content:space-between; padding:3px 0;
               border-bottom:1px solid rgba(0,0,0,0.06); font-size:12px; }}
    .tt-lbl {{ color:var(--muted); }}
    .tt-val {{ color:#0f172a; font-weight:500; text-align:right; max-width:170px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }}

    /* facade inspector */
    #facade-panel {{
      bottom:80px; left:50%; transform:translateX(-50%);
      width:560px; display:none;
    }}
    #facade-views {{ display:flex; gap:8px; margin-top:10px; }}
    .facade-thumb {{
      flex:1; aspect-ratio:4/3; border-radius:8px; overflow:hidden;
      border:2px solid var(--border); cursor:pointer; position:relative;
    }}
    .facade-thumb img {{ width:100%; height:100%; object-fit:cover; }}
    .facade-thumb canvas {{ width:100%; height:100%; object-fit:cover; }}
    .facade-thumb .dir-label {{
      position:absolute; bottom:4px; left:50%; transform:translateX(-50%);
      font-size:10px; font-weight:700; background:rgba(0,0,0,0.7);
      color:#fff; padding:2px 8px; border-radius:4px;
    }}
    .facade-thumb.active {{ border-color:#a78bfa; }}

    /* wwr result */
    #wwr-panel {{
      bottom:80px; right:16px; width:220px; display:none;
    }}
    .wwr-bar-wrap {{ margin:8px 0 4px; height:10px; border-radius:5px;
                     background:rgba(0,0,0,0.08); overflow:hidden; }}
    .wwr-bar {{ height:100%; border-radius:5px;
                background:linear-gradient(90deg,#7c3aed,#a78bfa); transition:width .4s; }}
    .wwr-value {{ font-size:22px; font-weight:700; color:var(--lime); }}
    .wwr-unit  {{ font-size:11px; color:var(--muted); }}

    /* loading overlay */
    #loading {{
      position:fixed; inset:0; z-index:999;
      background:#0f1117; display:flex; flex-direction:column;
      align-items:center; justify-content:center; gap:16px;
    }}
    #loading h1 {{ font-size:18px; font-weight:700; color:var(--lime); }}
    #loading p  {{ font-size:13px; color:var(--muted); }}
    .spinner {{
      width:40px; height:40px; border:3px solid rgba(114,28,184,0.3);
      border-top-color:#a78bfa; border-radius:50%;
      animation:spin .8s linear infinite;
    }}
    @keyframes spin {{ to {{ transform:rotate(360deg); }} }}

    /* legend */
    .legend-row {{ display:flex; align-items:center; gap:6px; margin:4px 0; font-size:11px; cursor:pointer; }}
    .legend-row:hover {{ color:var(--text); }}
    .legend-dot {{ width:10px; height:10px; border-radius:3px; flex-shrink:0; }}
    .legend-cnt {{ margin-left:auto; color:var(--faint); }}

    /* search (inside left sidebar) */
    #search-wrap {{ padding:10px 10px 0; flex-shrink:0; position:relative; }}
    #search-row  {{ display:flex; gap:5px; }}
    #search-input {{
      flex:1; padding:7px 10px; border-radius:8px;
      border:1px solid var(--border); background:rgba(255,255,255,0.06);
      color:var(--text); font-size:12px; outline:none;
    }}
    #search-input:focus {{ border-color:#7c3aed; }}
    #search-btn {{ padding:6px 10px; border-radius:8px; flex-shrink:0; }}
    #search-results {{
      position:absolute; top:calc(100% + 4px); left:10px; right:10px;
      background:rgba(10,10,20,0.96); border:1px solid var(--border);
      border-radius:8px; backdrop-filter:blur(16px); display:none;
      max-height:200px; overflow-y:auto; z-index:30;
    }}
    .result-item {{ padding:8px 12px; cursor:pointer; font-size:12px; border-bottom:1px solid rgba(255,255,255,0.05); }}
    .result-item:hover {{ background:rgba(114,28,184,0.2); }}

    /* brand */
    #ppg-brand {{
      position:absolute; bottom:24px; right:20px; z-index:20;
      font-size:10px; font-weight:700; color:rgba(255,255,255,0.25);
      letter-spacing:.8px; text-transform:uppercase; pointer-events:none;
    }}
    #controls-hint {{
      position:absolute; bottom:8px; left:50%; transform:translateX(-50%); z-index:20;
      font-size:11px; color:rgba(255,255,255,0.45); pointer-events:none;
      white-space:nowrap; letter-spacing:.3px;
    }}
  </style>
</head>
<body>

<!-- Loading overlay -->
<div id="loading">
  <div class="spinner"></div>
  <h1>&#127963; Gothenburg 3D</h1>
  <p id="loading-status">Initialising Cesium…</p>
</div>

<!-- Cesium main viewer -->
<div id="cesium-container"></div>

<!-- Left sidebar: search + summary + legend + view options -->
<div id="left-panel">
  <div id="lp-header">
    <span class="lp-title">&#127963; Gothenburg 3D</span>
    <span class="lp-sub">EUBUCCO v0.2 + EPC &middot; {n_total:,} buildings</span>
  </div>
  <div id="search-wrap">
    <div id="search-row">
      <input id="search-input" type="text" placeholder="Search address&hellip;" autocomplete="off">
      <button class="btn" id="search-btn">&#128269;</button>
    </div>
    <div id="search-results"></div>
  </div>
  <div id="lp-stats">
    <div class="stat-box">
      <div class="stat-num">{n_epc_matched:,}</div>
      <div class="stat-lbl">EPC matched</div>
    </div>
    <div class="stat-box">
      <div class="stat-num stat-num-2">{n_eclass_total:,}</div>
      <div class="stat-lbl">TABULA matched</div>
    </div>
  </div>
  <div id="lp-tabs">
    <button class="lp-tab active" id="btn-use">&#127968; Use type</button>
    <button class="lp-tab" id="btn-eclass">&#9889; Energy</button>
    <button class="lp-tab" id="btn-year">&#128197; Year era</button>
  </div>
  <div id="legend-container"></div>
  <div class="lp-hint">Click a row to see best &amp; worst performers</div>
  <div class="lp-divider"></div>
  <div class="lp-section-title">View Options</div>
  <div id="lp-options">
    <button class="btn opt-btn" id="btn-tiles">&#127759; Photorealistic Tiles</button>
    <button class="btn opt-btn" id="btn-eubucco">&#127963; EUBUCCO Overlay</button>
    <button class="btn opt-btn" id="btn-reset">&#8962; Reset View</button>
  </div>
  <div class="lp-divider"></div>
  <div class="lp-section-title">Analysis Tools</div>
  <div style="padding:0 10px 6px;display:flex;flex-direction:column;gap:5px;flex-shrink:0">
    <button class="tool-btn" id="btn-inspect" disabled>WWR Estimation</button>
    <div id="inspect-saved-badge" style="display:none;font-size:10px;color:var(--muted);padding-left:2px;margin-top:-3px"></div>
    <button class="tool-btn pvgis-btn" id="btn-pvgis" disabled>&#9728; Rooftop PV Estimate</button>
    <div id="pvgis-saved-badge" style="display:none;font-size:10px;color:var(--muted);padding-left:2px;margin-top:-3px"></div>
    <div id="pvgis-result"></div>
    <div id="lp-no-selection">&#8592; Click a building to enable</div>
  </div>
</div>

<!-- Building info panel -->
<div class="panel" id="info-panel">
  <button class="close-btn" id="info-close">&#x2715;</button>
  <h2>&#127963; Building</h2>
  <div id="info-content"></div>
</div>

<!-- Hover tooltip card -->
<div id="hover-card" style="
  display:none; position:fixed; pointer-events:none; z-index:9999;
  background:rgba(10,10,20,0.92); border:1px solid rgba(114,28,184,0.5);
  border-radius:10px; padding:10px 13px; min-width:200px; max-width:280px;
  font-family:Inter,sans-serif; font-size:12px; color:#e2e8f0;
  box-shadow:0 4px 20px rgba(0,0,0,0.6); backdrop-filter:blur(6px);
"></div>

<!-- Facade inspector -->
<div class="panel" id="facade-panel">
  <h2>Facade Inspector</h2>
  <div class="sub" id="facade-sub">Click a facade view to capture screenshot and estimate WWR</div>
  <div id="facade-views">
    <div class="facade-thumb" id="thumb-N"><canvas id="canvas-N" width="200" height="150"></canvas><div class="dir-label">N</div></div>
    <div class="facade-thumb" id="thumb-E"><canvas id="canvas-E" width="200" height="150"></canvas><div class="dir-label">E</div></div>
    <div class="facade-thumb" id="thumb-S"><canvas id="canvas-S" width="200" height="150"></canvas><div class="dir-label">S</div></div>
    <div class="facade-thumb" id="thumb-W"><canvas id="canvas-W" width="200" height="150"></canvas><div class="dir-label">W</div></div>
  </div>
  <div style="display:flex;gap:8px;margin-top:10px">
    <button class="btn" id="btn-capture-all" style="flex:1">&#128247; Capture All Facades</button>
    <button class="btn" id="btn-exit-inspect" style="flex:1">&#x2715; Exit Inspector</button>
  </div>
</div>

<!-- WWR result panel -->
<div class="panel" id="wwr-panel">
  <h2>&#128438; WWR Estimate</h2>
  <div class="sub">Window-to-Wall Ratio</div>
  <div class="wwr-value" id="wwr-value">–</div>
  <span class="wwr-unit">% average across facades</span>
  <div class="wwr-bar-wrap"><div class="wwr-bar" id="wwr-bar" style="width:0%"></div></div>
  <div id="wwr-tabula-row" style="margin-top:8px;font-size:11px;display:none">
    <span style="color:var(--muted)">TABULA reference:</span>
    <span id="wwr-tabula-val" style="color:var(--lime);font-weight:700"></span>
    <span style="color:var(--muted)"> % (</span><span id="wwr-tabula-period" style="color:var(--muted)"></span><span style="color:var(--muted)">)</span>
  </div>
  <div id="wwr-breakdown" style="margin-top:6px;font-size:11px;color:var(--muted)"></div>
  <div id="wwr-ai-status" style="margin-top:6px;font-size:11px;color:var(--muted)"></div>
  <div style="margin-top:8px;font-size:10px;color:var(--faint)">
    TABULA archetype reference · GPT-4 vision per facade.
  </div>
</div>

<!-- Token panel — shown on startup until a valid token is applied -->
<div class="panel" id="token-panel" style="top:16px;right:16px;width:320px;display:none">
  <h2>&#128273; Cesium Ion Token Required</h2>
  <div class="sub">Google Photorealistic 3D Tiles stream real building facade &amp; roof textures directly from Google Maps.</div>
  <div style="font-size:11px;color:var(--muted);margin-bottom:8px">
    1. Sign up free at <a href="https://ion.cesium.com" target="_blank" style="color:#a78bfa">ion.cesium.com</a><br>
    2. Go to <b>Access Tokens</b> → create a token<br>
    3. Enable <b>Google Photorealistic 3D Tiles</b> asset (2275207)<br>
    4. Paste your token below and click Apply
  </div>
  <input id="token-input" type="text" placeholder="Paste your Cesium ion token…"
    style="width:100%;padding:8px 10px;border-radius:8px;border:1px solid var(--border);
           background:rgba(255,255,255,0.06);color:var(--text);font-size:12px;margin-bottom:8px;outline:none">
  <button class="btn" id="token-apply" style="width:100%;margin-bottom:6px">&#128640; Apply &amp; Load 3D Tiles</button>
  <div id="token-error" style="font-size:11px;color:#f87171;min-height:14px"></div>
</div>

<!-- Performance card panel — sortable + compare -->
<div class="panel" id="perf-panel" style="display:none;top:16px;right:16px;width:320px;max-height:82vh;flex-direction:column;overflow:hidden">
  <button class="close-btn" id="perf-close">&#x2715;</button>
  <h2 id="perf-title">Performance</h2>
  <div class="sub" id="perf-sub"></div>
  <div id="perf-content" style="margin-top:10px;overflow-y:auto;flex:1"></div>
</div>

<!-- Controls moved into left sidebar -->

<div id="ppg-brand">PPG · Chalmers / Boverket</div>
<div id="controls-hint">&#128205; Scroll to zoom &nbsp;·&nbsp; Drag to pan &nbsp;·&nbsp; Right-drag or Ctrl+drag to tilt/rotate &nbsp;·&nbsp; Hover buildings for details</div>

<script>
// ─────────────────────────────────────────────────────────────────
// DATA
// ─────────────────────────────────────────────────────────────────
const DATA = {data_json};
const PERIOD_CARDS  = {period_cards_js};
const ECLASS_CARDS  = {eclass_cards_js};
const USE_CARDS     = {use_cards_js};
const PERIOD_STATS  = {period_stats_js};

// Legend metadata
const USE_LABELS_JS = {{
  bostad_enfamilj:   'Single-family residential',
  bostad_flerfamilj: 'Multi-family residential',
  verksamhet:        'Commercial / Workplace',
  industri:          'Industrial',
  samhalle:          'Public / School / Care',
  komplement:        'Complement (garage/shed)',
  ovrigt:            'Other / Unknown',
}};
const ECLASS_LABELS_JS = {{
  A:'A – Very efficient', B:'B – Efficient', C:'C – Above average',
  D:'D – Average', E:'E – Below average', F:'F – Poor', G:'G – Very poor',
}};
const PERIOD_LABELS_JS = {{
  '...1960':'Pre-1960','1961-1975':'1961–1975','1976-1985':'1976–1985',
  '1986-1995':'1986–1995','1996-2005':'1996–2005','post-2005':'Post-2005',
}};

// CSS colour strings for legend dots
const USE_CSS = {{
  bostad_enfamilj:'rgb(255,165,50)',   bostad_flerfamilj:'rgb(255,210,60)',
  verksamhet:'rgb(70,180,255)',         industri:'rgb(200,80,60)',
  samhalle:'rgb(70,210,140)',           komplement:'rgb(140,140,160)',
  ovrigt:'rgb(160,120,200)',
}};
const ECLASS_CSS = {{
  A:'rgb(22,163,74)',   B:'rgb(74,222,128)',  C:'rgb(190,242,60)',
  D:'rgb(250,204,21)',  E:'rgb(251,146,60)',  F:'rgb(239,68,68)',
  G:'rgb(153,27,27)',
}};
const PERIOD_CSS = {{
  '...1960':'rgb(100,149,237)', '1961-1975':'rgb(255,165,50)',
  '1976-1985':'rgb(154,205,50)','1986-1995':'rgb(218,165,32)',
  '1996-2005':'rgb(255,99,71)', 'post-2005':'rgb(147,112,219)',
}};

// Count buildings per key from DATA array (computed once)
const _useCounts = {{}}, _eclassCounts = {{}}, _periodCounts = {{}};
for (const b of DATA) {{
  _useCounts[b.use_cat]         = (_useCounts[b.use_cat]         || 0) + 1;
  if (b.eclass)      _eclassCounts[b.eclass]      = (_eclassCounts[b.eclass]      || 0) + 1;
  if (b.tabula_period) _periodCounts[b.tabula_period] = (_periodCounts[b.tabula_period] || 0) + 1;
}}

function updateLegend(mode) {{
  const container = document.getElementById('legend-container');
  let rows = [];

  if (mode === 'use') {{
    rows = Object.entries(USE_LABELS_JS).map(([key, lbl]) => {{
      const cnt = _useCounts[key] || 0;
      const cards = USE_CARDS[key];
      return {{ key, lbl, color: USE_CSS[key], cnt, hasCards: cards && cards.buildings.length > 0 }};
    }});
    container.innerHTML = '<div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Building use type</div>';

  }} else if (mode === 'eclass') {{
    rows = Object.entries(ECLASS_LABELS_JS).map(([key, lbl]) => {{
      const cnt = _eclassCounts[key] || 0;
      const stats = PERIOD_STATS;  // reuse — eclass cards loaded separately
      const cards = ECLASS_CARDS[key];
      return {{ key, lbl, color: ECLASS_CSS[key], cnt, hasCards: cards && (cards.best.length || cards.worst.length) }};
    }});
    container.innerHTML = '<div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Energy class (A–G)</div>';

  }} else {{ // year/period
    rows = Object.keys(PERIOD_LABELS_JS).map(key => {{
      const cnt = _periodCounts[key] || 0;
      const st  = PERIOD_STATS[key] || {{}};
      const cards = PERIOD_CARDS[key];
      const sub = st.median_kwh ? ' · ' + st.median_kwh + ' kWh/m²' : '';
      return {{ key, lbl: PERIOD_LABELS_JS[key] + sub, color: PERIOD_CSS[key], cnt, hasCards: cards && (cards.best.length || cards.worst.length) }};
    }});
    container.innerHTML = '<div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Construction era</div>';
  }}

  for (const r of rows) {{
    const div = document.createElement('div');
    div.className = 'legend-row';
    div.style.cssText = 'display:flex;align-items:center;gap:6px;margin:5px 0;font-size:11px;cursor:'+(r.hasCards?'pointer':'default')+';border-radius:6px;padding:3px 5px;transition:background .15s';
    if (r.hasCards) div.style.cursor = 'pointer';
    div.innerHTML = '<div style="width:12px;height:12px;border-radius:3px;background:'+r.color+';flex-shrink:0"></div>'
      + '<span style="flex:1">'+r.lbl+'</span>'
      + '<span style="color:var(--faint);font-size:10px">'+r.cnt.toLocaleString()+'</span>'
      + (r.hasCards ? '<span style="margin-left:4px;font-size:10px;color:#a78bfa" title="Click to see best/worst">&#9654;</span>' : '');
    if (r.hasCards) {{
      const _key = r.key, _mode = mode;
      div.addEventListener('mouseenter', () => div.style.background = 'rgba(167,139,250,0.1)');
      div.addEventListener('mouseleave', () => div.style.background = '');
      div.addEventListener('click', () => showPerfCards(_mode, _key));
    }}
    container.appendChild(div);
  }}
}}

// ─────────────────────────────────────────────────────────────────
// Performance card panel — sortable + compare
// ─────────────────────────────────────────────────────────────────
const ECLASS_BADGE = {{ A:'#16a34a',B:'#4ade80',C:'#bef264',D:'#facc15',E:'#fb923c',F:'#ef4444',G:'#991b1b' }};
const ECLASS_TEXT  = {{ A:'#fff',   B:'#000',   C:'#000',   D:'#000',   E:'#fff',   F:'#fff',   G:'#fff' }};
const PERIOD_SHORT = {{ '...1960':'<1960','1961-1975':'61–75','1976-1985':'76–85','1986-1995':'86–95','1996-2005':'96–05','post-2005':'>2005' }};

let _perfMode = null, _perfKey = null;
let _sortMode  = 'energy';    // 'energy' | 'year' | 'eclass'
let _compareSet = new Set();  // addresses in compare basket
let _perfList   = [];         // full building list for current panel

function showPerfCards(mode, key) {{
  _perfMode = mode; _perfKey = key;
  _compareSet.clear();

  if (mode === 'use') {{
    const entry = USE_CARDS[key];
    if (!entry || !entry.buildings.length) return;
    _perfList = [...entry.buildings];
    document.getElementById('perf-title').textContent = USE_LABELS_JS[key];
    document.getElementById('perf-sub').textContent = _perfList.length + ' buildings with EPC data';
  }} else if (mode === 'eclass') {{
    const cards = ECLASS_CARDS[key];
    if (!cards) return;
    // merge best+worst, deduplicate by addr
    const seen = new Set();
    _perfList = [...cards.best, ...cards.worst].filter(c => {{ const ok = !seen.has(c.addr); seen.add(c.addr); return ok; }});
    document.getElementById('perf-title').textContent = 'Energy Class ' + key;
    document.getElementById('perf-sub').textContent = (ECLASS_LABELS_JS[key]||key) + ' · ' + _perfList.length + ' shown';
  }} else {{
    const cards = PERIOD_CARDS[key];
    if (!cards) return;
    const seen = new Set();
    _perfList = [...cards.best, ...cards.worst].filter(c => {{ const ok = !seen.has(c.addr); seen.add(c.addr); return ok; }});
    document.getElementById('perf-title').textContent = PERIOD_LABELS_JS[key] || key;
    document.getElementById('perf-sub').textContent = 'Construction era · ' + _perfList.length + ' shown';
  }}

  _sortMode = 'energy';
  renderPerfList();
  document.getElementById('token-panel').style.display = 'none';
  document.getElementById('perf-panel').style.display = 'flex';
}}

function renderPerfList() {{
  // ---- sort ----
  const sorted = [..._perfList].sort((a,b) => {{
    if (_sortMode === 'year')   return (a.year||9999) - (b.year||9999);
    if (_sortMode === 'eclass') return (a.eclass||'Z').localeCompare(b.eclass||'Z');
    return (a.energy||9999) - (b.energy||9999);
  }});

  // ---- sort tabs ----
  const tabs = [['energy','⚡ Energy'],['year','📅 Year built'],['eclass','🏷 Class']].map(([m,lbl]) =>
    '<button onclick="_sortMode=\\''+m+'\\';renderPerfList()" style="flex:1;padding:5px 0;font-size:11px;border:none;border-radius:6px;cursor:pointer;font-family:inherit;'
    +(_sortMode===m?'background:#7c3aed;color:#fff;font-weight:600':'background:rgba(255,255,255,0.07);color:var(--muted)')
    +'">'+lbl+'</button>'
  ).join('');

  // ---- compare bar ----
  let cmpHtml = '';
  if (_compareSet.size >= 2) {{
    const sel = sorted.filter(b => _compareSet.has(b.addr));
    const minE = Math.min(...sel.map(b=>b.energy||999));
    const maxE = Math.max(...sel.map(b=>b.energy||0));
    cmpHtml = '<div style="background:#7c3aed22;border:1px solid #7c3aed55;border-radius:8px;padding:10px;margin-bottom:8px">';
    cmpHtml += '<div style="font-weight:600;color:#a78bfa;font-size:11px;margin-bottom:8px">⚖ Compare ('+_compareSet.size+')</div>';
    for (const b of sel) {{
      const span = maxE > minE ? (b.energy - minE)/(maxE - minE) : 0.5;
      const pct  = Math.round(span * 100);
      const barC = pct < 33 ? '#22c55e' : pct < 66 ? '#f59e0b' : '#ef4444';
      const badge = b.eclass ? '<span style="background:'+(ECLASS_BADGE[b.eclass]||'#555')+';color:'+(ECLASS_TEXT[b.eclass]||'#fff')+';border-radius:3px;padding:0 4px;font-size:9px">'+b.eclass+'</span>' : '';
      cmpHtml += '<div style="margin-bottom:7px">';
      cmpHtml +=   '<div style="display:flex;align-items:center;gap:5px"><span style="flex:1;font-size:11px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+b.addr+'</span>'+badge+'</div>';
      cmpHtml +=   '<div style="display:flex;align-items:center;gap:6px;margin-top:3px">';
      cmpHtml +=     '<div style="flex:1;height:6px;background:rgba(255,255,255,0.1);border-radius:3px"><div style="width:'+Math.max(4,pct)+'%;height:100%;background:'+barC+';border-radius:3px;transition:width .3s"></div></div>';
      cmpHtml +=     '<span style="font-size:11px;color:'+barC+';font-weight:700;white-space:nowrap">'+b.energy+' kWh/m²</span>';
      cmpHtml +=   '</div>';
      const meta = [b.year?'Built '+b.year:'', b.area?b.area+' m²':''].filter(Boolean).join(' · ');
      if (meta) cmpHtml += '<div style="font-size:9px;color:var(--faint);margin-top:1px">'+meta+'</div>';
      cmpHtml += '</div>';
    }}
    cmpHtml += '</div>';
  }}

  // ---- building rows ----
  let rows = '';
  for (const b of sorted) {{
    const inCmp = _compareSet.has(b.addr);
    const ec    = b.energy || 0;
    const eColor = ec < 100 ? '#22c55e' : ec < 200 ? '#f59e0b' : '#ef4444';
    const badge = b.eclass
      ? '<span style="background:'+(ECLASS_BADGE[b.eclass]||'#555')+';color:'+(ECLASS_TEXT[b.eclass]||'#fff')+';border-radius:3px;padding:1px 5px;font-size:10px">'+b.eclass+'</span>'
      : '<span style="color:var(--faint);font-size:10px">–</span>';
    const perBadge = b.period
      ? '<span style="background:rgba(255,255,255,0.08);border-radius:3px;padding:1px 4px;font-size:9px;color:var(--muted)">'+(PERIOD_SHORT[b.period]||b.period)+'</span>'
      : '';
    const meta = [b.year?'Built '+b.year:'', b.area?b.area+' m²':''].filter(Boolean).join(' · ');
    const safeAddrHtml = (b.addr||'').replace(/"/g,"&quot;");
    rows += '<div data-addr="'+safeAddrHtml+'" class="pr"'
      + ' style="background:'+(inCmp?'rgba(124,58,237,0.18)':'rgba(255,255,255,0.04)')+';border-radius:8px;padding:8px 10px;margin:4px 0;cursor:pointer;'
      + 'border:1px solid '+(inCmp?'#7c3aed':'transparent')+';transition:all .15s">';
    rows +=   '<div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap">'
            + '<span style="flex:1;font-size:11px;font-weight:600;line-height:1.3">'+b.addr+'</span>'
            + badge + ' ' + perBadge
            + '</div>';
    rows +=   '<div style="display:flex;align-items:center;gap:6px;margin-top:4px">'
            + '<span style="font-size:13px;font-weight:700;color:'+eColor+'">'+b.energy+'</span>'
            + '<span style="font-size:10px;color:var(--muted)">kWh/m²</span>'
            + (meta?'<span style="font-size:10px;color:var(--faint);margin-left:auto">'+meta+'</span>':'')
            + '</div>';
    rows += '</div>';
  }}

  const hint = '<div style="text-align:center;font-size:10px;color:var(--faint);padding:8px 0">Tap a card to add to compare (max 3)</div>';

  document.getElementById('perf-content').innerHTML =
    '<div style="display:flex;gap:4px;margin-bottom:10px">'+tabs+'</div>'
    + cmpHtml
    + rows
    + hint;
  document.querySelectorAll('#perf-content .pr').forEach(el => {{
    const addr = el.getAttribute('data-addr');
    el.addEventListener('click', () => toggleCompare(addr));
    el.addEventListener('mouseenter', () => {{ el.style.background = 'rgba(255,255,255,0.08)'; }});
    el.addEventListener('mouseleave', () => {{ el.style.background = _compareSet.has(addr) ? 'rgba(124,58,237,0.18)' : 'rgba(255,255,255,0.04)'; }});
  }});
}}

function toggleCompare(addr) {{
  if (_compareSet.has(addr)) {{ _compareSet.delete(addr); renderPerfList(); return; }}
  if (_compareSet.size >= 3) {{ return; }}  // max 3
  _compareSet.add(addr);
  renderPerfList();
}}

document.getElementById('perf-close').addEventListener('click', () => {{
  document.getElementById('perf-panel').style.display = 'none';
}});

const USE_COLORS = {{
  bostad_enfamilj:   Cesium.Color.fromBytes(255,165, 50,210),
  bostad_flerfamilj: Cesium.Color.fromBytes(255,210, 60,210),
  verksamhet:        Cesium.Color.fromBytes( 70,180,255,210),
  industri:          Cesium.Color.fromBytes(200, 80, 60,210),
  samhalle:          Cesium.Color.fromBytes( 70,210,140,210),
  komplement:        Cesium.Color.fromBytes(140,140,160,180),
  ovrigt:            Cesium.Color.fromBytes(160,120,200,180),
}};
const ECLASS_COLORS = {{
  A: Cesium.Color.fromBytes( 22,163, 74,230),
  B: Cesium.Color.fromBytes( 74,222,128,220),
  C: Cesium.Color.fromBytes(190,242, 60,210),
  D: Cesium.Color.fromBytes(250,204, 21,215),
  E: Cesium.Color.fromBytes(251,146, 60,220),
  F: Cesium.Color.fromBytes(239, 68, 68,225),
  G: Cesium.Color.fromBytes(153, 27, 27,230),
}};
const PERIOD_COLORS = {{
  '...1960':     Cesium.Color.fromBytes(100,149,237,220),
  '1961-1975':   Cesium.Color.fromBytes(255,165, 50,220),
  '1976-1985':   Cesium.Color.fromBytes(154,205, 50,220),
  '1986-1995':   Cesium.Color.fromBytes(218,165, 32,220),
  '1996-2005':   Cesium.Color.fromBytes(255, 99, 71,220),
  'post-2005':   Cesium.Color.fromBytes(147,112,219,220),
}};

// ─────────────────────────────────────────────────────────────────
// WWR heuristic lookup (from TABULA archetypes + literature)
// keyed by [use_cat][tabula_period]
// ─────────────────────────────────────────────────────────────────
const WWR_TABLE = {{
  bostad_enfamilj:   {{ '...1960':15, '1961-1975':17, '1976-1985':19, '1986-1995':21, '1996-2005':23, 'post-2005':26 }},
  bostad_flerfamilj: {{ '...1960':22, '1961-1975':28, '1976-1985':26, '1986-1995':30, '1996-2005':33, 'post-2005':38 }},
  verksamhet:        {{ '...1960':30, '1961-1975':40, '1976-1985':45, '1986-1995':50, '1996-2005':55, 'post-2005':60 }},
  industri:          {{ '...1960': 8, '1961-1975':10, '1976-1985':12, '1986-1995':12, '1996-2005':14, 'post-2005':15 }},
  samhalle:          {{ '...1960':25, '1961-1975':35, '1976-1985':38, '1986-1995':40, '1996-2005':45, 'post-2005':50 }},
  komplement:        {{ '...1960': 5, '1961-1975': 5, '1976-1985': 5, '1986-1995': 8, '1996-2005':10, 'post-2005':10 }},
  ovrigt:            {{ '...1960':20, '1961-1975':22, '1976-1985':24, '1986-1995':25, '1996-2005':28, 'post-2005':30 }},
}};

// Energy class modifier on WWR heuristic (A=very glazed efficient vs G=poorly insulated old)
const ECLASS_WWR_ADJ = {{ A:+5, B:+3, C:+1, D:0, E:-1, F:-2, G:-3 }};

function heuristicWWR(building) {{
  const use = building.use_cat || 'ovrigt';
  const period = building.tabula_period || '1961-1975';
  const eclass = building.eclass || null;
  const base = (WWR_TABLE[use] || WWR_TABLE.ovrigt)[period] || 20;
  const adj  = eclass ? (ECLASS_WWR_ADJ[eclass] || 0) : 0;
  return Math.min(75, Math.max(5, base + adj));
}}

// ─────────────────────────────────────────────────────────────────
if (window.location.protocol === 'file:') {{
  document.getElementById('loading').innerHTML =
    '<div style="text-align:center;padding:40px;max-width:440px">' +
    '<div style="font-size:48px;margin-bottom:16px">&#128274;</div>' +
    '<h1 style="color:#96D74C;font-size:18px;margin-bottom:12px">Run via local server</h1>' +
    '<p style="color:#94a3b8;font-size:13px;line-height:1.8">Cesium cannot load its 3D engine from <b>file://</b>.<br><br>' +
    'Open a terminal in the project folder and run:<br><br>' +
    '<code style="background:rgba(255,255,255,0.1);padding:8px 20px;border-radius:8px;font-size:14px">python launch.py</code><br><br>' +
    'Your browser will open automatically at<br><b style="color:#a78bfa">http://localhost:8765</b></p>' +
    '</div>';
  throw new Error('file:// not supported');
}}

// ─────────────────────────────────────────────────────────────────
// Cesium ion token — get yours free at ion.cesium.com
// Required for Google Photorealistic 3D Tiles (real building textures)
// ─────────────────────────────────────────────────────────────────
let ION_TOKEN = localStorage.getItem('cesium_ion_token') ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI4NmE0YWM4NS1hMjI0LTRiY2YtOGFkYS0yOGNiNTA2ZGM2MGIiLCJpZCI6NDI3NDMzLCJzdWIiOiJzYXJhYWJvIiwiaXNzIjoiaHR0cHM6Ly9pb24uY2VzaXVtLmNvbSIsImF1ZCI6IkJ1aWxkaW5ncyIsImlhdCI6MTc3Nzk4NDUwMn0.YfKFn0wvu95IcXJORmvmhTMAQ44-y8_qoajP_339Y4o';
if (ION_TOKEN) Cesium.Ion.defaultAccessToken = ION_TOKEN;

// Viewer: globe:false per Cesium guide — photorealistic tiles replace the globe entirely
const viewer = new Cesium.Viewer('cesium-container', {{
  timeline:false, animation:false, baseLayerPicker:false,
  geocoder:false, homeButton:false, sceneModePicker:false,
  navigationHelpButton:false, fullscreenButton:false,
  selectionIndicator:false, infoBox:false,
  globe: false,
}});
viewer.cesiumWidget.creditContainer.style.display = 'none';
// Fix black sky — enable atmosphere and sky box
viewer.scene.skyAtmosphere = new Cesium.SkyAtmosphere();
viewer.scene.skyBox = new Cesium.SkyBox({{
  sources: {{
    positiveX: 'https://cdn.jsdelivr.net/npm/cesium@1.143.0/Build/Cesium/Assets/Textures/SkyBox/tycho2t3_80_px.jpg',
    negativeX: 'https://cdn.jsdelivr.net/npm/cesium@1.143.0/Build/Cesium/Assets/Textures/SkyBox/tycho2t3_80_mx.jpg',
    positiveY: 'https://cdn.jsdelivr.net/npm/cesium@1.143.0/Build/Cesium/Assets/Textures/SkyBox/tycho2t3_80_py.jpg',
    negativeY: 'https://cdn.jsdelivr.net/npm/cesium@1.143.0/Build/Cesium/Assets/Textures/SkyBox/tycho2t3_80_my.jpg',
    positiveZ: 'https://cdn.jsdelivr.net/npm/cesium@1.143.0/Build/Cesium/Assets/Textures/SkyBox/tycho2t3_80_pz.jpg',
    negativeZ: 'https://cdn.jsdelivr.net/npm/cesium@1.143.0/Build/Cesium/Assets/Textures/SkyBox/tycho2t3_80_mz.jpg',
  }}
}});
viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#87CEEB');  // sky blue fallback

// Maps-style camera controls
// Scroll = zoom · Drag = pan · Right-drag / Ctrl+drag = tilt/rotate
const camCtrl = viewer.scene.screenSpaceCameraController;
camCtrl.zoomEventTypes        = [Cesium.CameraEventType.WHEEL, Cesium.CameraEventType.PINCH];
camCtrl.translateEventTypes   = Cesium.CameraEventType.LEFT_DRAG;
camCtrl.tiltEventTypes        = [
  Cesium.CameraEventType.RIGHT_DRAG,
  {{ eventType: Cesium.CameraEventType.LEFT_DRAG, modifier: Cesium.KeyboardEventModifier.CTRL }},
];
camCtrl.rotateEventTypes      = [
  Cesium.CameraEventType.RIGHT_DRAG,
  {{ eventType: Cesium.CameraEventType.LEFT_DRAG, modifier: Cesium.KeyboardEventModifier.CTRL }},
];
camCtrl.lookEventTypes        = [];
camCtrl.enableCollisionDetection = false;

// ─────────────────────────────────────────────────────────────────
// Google Photorealistic 3D Tiles — real facade + roof textures from Google Maps
// ─────────────────────────────────────────────────────────────────
let googleTileset = null;
let tilesEnabled  = false;
let eubuccoVisible = true;

async function loadGoogleTiles(token) {{
  try {{
    setLoading('Loading Google Photorealistic 3D Tiles…');
    Cesium.Ion.defaultAccessToken = token;
    if (googleTileset) {{ viewer.scene.primitives.remove(googleTileset); googleTileset = null; }}
    // Exactly as per https://cesium.com/learn/cesiumjs-learn/cesiumjs-photorealistic-3d-tiles/
    googleTileset = await Cesium.createGooglePhotorealistic3DTileset();
    viewer.scene.primitives.add(googleTileset);
    tilesEnabled = true;
    ION_TOKEN = token;
    document.getElementById('btn-tiles').classList.add('active');
    document.getElementById('token-panel').style.display = 'none';
    localStorage.setItem('cesium_ion_token', token);
    setLoading('');
    console.log('✅ Google Photorealistic 3D Tiles loaded');
  }} catch(err) {{
    setLoading('');
    tilesEnabled = false;
    document.getElementById('btn-tiles').classList.remove('active');
    console.error('❌ Google 3D Tiles failed:', err.message);
    // Always show token panel on failure
    const panel = document.getElementById('token-panel');
    panel.style.display = 'block';
    document.getElementById('token-error').textContent = 'Error: ' + err.message + ' — Paste a valid token from ion.cesium.com';
  }}
}}

// Token apply button
document.getElementById('token-apply').addEventListener('click', () => {{
  const t = document.getElementById('token-input').value.trim();
  if (t) loadGoogleTiles(t);
}});
document.getElementById('token-input').addEventListener('keydown', e => {{
  if (e.key === 'Enter') document.getElementById('token-apply').click();
}});

// Toggle tiles on/off
document.getElementById('btn-tiles').addEventListener('click', () => {{
  if (!tilesEnabled) {{
    if (ION_TOKEN) {{ loadGoogleTiles(ION_TOKEN); }}
    else {{ document.getElementById('token-panel').style.display = 'block'; }}
  }} else {{
    tilesEnabled = false;
    if (googleTileset) {{ viewer.scene.primitives.remove(googleTileset); googleTileset = null; }}
    document.getElementById('btn-tiles').classList.remove('active');
  }}
}});

// Toggle EUBUCCO overlay
document.getElementById('btn-eubucco').addEventListener('click', () => {{
  eubuccoVisible = !eubuccoVisible;
  document.getElementById('btn-eubucco').classList.toggle('active', eubuccoVisible);
  if (buildingDS) buildingDS.show = eubuccoVisible;
}});

// ─────────────────────────────────────────────────────────────────
// Build extruded buildings — CustomDataSource (no Cesium workers needed)
// ─────────────────────────────────────────────────────────────────
let colorMode = 'use';
let buildingDS = null;

function getBuildingColor(b) {{
  if (colorMode === 'eclass')
    return (b.eclass && ECLASS_COLORS[b.eclass]) ? ECLASS_COLORS[b.eclass] : Cesium.Color.fromBytes(60,60,70,140);
  if (colorMode === 'year')
    return (b.tabula_period && PERIOD_COLORS[b.tabula_period]) ? PERIOD_COLORS[b.tabula_period] : Cesium.Color.fromBytes(60,60,70,140);
  return USE_COLORS[b.use_cat] || USE_COLORS.ovrigt;
}}

async function rebuildBuildings() {{
  setLoading('Loading ' + DATA.length.toLocaleString() + ' buildings…');
  if (buildingDS) {{ viewer.dataSources.remove(buildingDS, true); buildingDS = null; }}
  buildingDS = new Cesium.CustomDataSource('buildings');
  const CHUNK = 300;
  for (let start = 0; start < DATA.length; start += CHUNK) {{
    const end = Math.min(start + CHUNK, DATA.length);
    for (let i = start; i < end; i++) {{
      const b = DATA[i];
      const ring = b.coordinates[0];
      if (!ring || ring.length < 3) continue;
      const flat = [];
      for (const [lo, la] of ring) {{ flat.push(lo, la); }}
      const h = Math.max(3, b.height || (b.floors ? b.floors * 3 : 6));
      const col = getBuildingColor(b);

      // Roof cap — flat polygon on top
      const eRoof = buildingDS.entities.add({{
        polygon: {{
          hierarchy: new Cesium.PolygonHierarchy(Cesium.Cartesian3.fromDegreesArray(flat)),
          height: h,
          material: col.brighten(0.15, new Cesium.Color()).withAlpha(0.95),
          outline: false,
        }},
      }});
      eRoof._dataIdx = i;

      // Facade walls — explicit vertical surfaces, clearly visible from any angle
      const wallPositions = Cesium.Cartesian3.fromDegreesArray(flat);
      const maxH = new Array(ring.length).fill(h);
      const minH = new Array(ring.length).fill(0);
      const eWall = buildingDS.entities.add({{
        wall: {{
          positions: wallPositions,
          maximumHeights: maxH,
          minimumHeights: minH,
          material: col.withAlpha(0.90),
          outline: true,
          outlineColor: col.darken(0.3, new Cesium.Color()).withAlpha(1.0),
        }},
      }});
      eWall._dataIdx = i;
    }}
    setLoading('Loading buildings… ' + Math.round(end / DATA.length * 100) + '%');
    await new Promise(r => setTimeout(r, 0));
  }}
  await viewer.dataSources.add(buildingDS);
  setLoading('');
}}

// ─────────────────────────────────────────────────────────────────
// Loading helpers
// ─────────────────────────────────────────────────────────────────
function setLoading(msg) {{
  const el = document.getElementById('loading');
  if (!msg) {{ el.style.display = 'none'; return; }}
  document.getElementById('loading-status').textContent = msg;
  el.style.display = 'flex';
}}

// ─────────────────────────────────────────────────────────────────
// Fly to Gothenburg + start building
// ─────────────────────────────────────────────────────────────────
viewer.camera.flyTo({{
  destination: Cesium.Cartesian3.fromDegrees({cx:.6f}, {cy:.6f}, 800),
  orientation: {{ heading:0, pitch: Cesium.Math.toRadians(-40), roll:0 }},
  duration: 0,
}});

// Start: if token already saved, load tiles immediately; always load buildings
(async () => {{
  if (ION_TOKEN) {{
    document.getElementById('token-panel').style.display = 'none';
    await loadGoogleTiles(ION_TOKEN);
  }}
  await rebuildBuildings();
}})();

// ─────────────────────────────────────────────────────────────────
// Pick / click
// ─────────────────────────────────────────────────────────────────
let selectedBuilding = null;
let highlightEntity  = null;

viewer.screenSpaceEventHandler.setInputAction(movement => {{
  const hits = viewer.scene.drillPick(movement.position, 10);
  let found = null;
  for (const h of hits) {{ if (h && h.id && h.id._dataIdx !== undefined) {{ found = h; break; }} }}
  if (found) {{
    const b = DATA[found.id._dataIdx];
    if (b) showInfoPanel(b, found.id._dataIdx);
  }} else {{
    hideInfoPanel();
  }}
}}, Cesium.ScreenSpaceEventType.LEFT_CLICK);

// ─────────────────────────────────────────────────────────────────
// Hover tooltip
// ─────────────────────────────────────────────────────────────────
const TABULA_LABELS = {{
  '...1960':    'Pre-1960 (SFH/MFH)',
  '1961-1975':  '1961–1975 (Miljonprogrammet)',
  '1976-1985':  '1976–1985',
  '1986-1995':  '1986–1995',
  '1996-2005':  '1996–2005',
  'post-2005':  'Post-2005',
}};
const RESIDENTIAL = new Set(['bostad_enfamilj','bostad_flerfamilj']);
const ECLASS_COLORS_CSS = {{ A:'#16a34a',B:'#4ade80',C:'#a3e635',D:'#facc15',E:'#fb923c',F:'#f87171',G:'#dc2626' }};

const hoverCard = document.getElementById('hover-card');
let lastHoverId = null;
let hoverThrottle = 0;

viewer.screenSpaceEventHandler.setInputAction(movement => {{
  // Throttle to ~30fps
  const now = Date.now();
  if (now - hoverThrottle < 33) {{
    // Still move card if already showing
    if (hoverCard.style.display !== 'none') {{
      const x = movement.endPosition.x, y = movement.endPosition.y;
      hoverCard.style.left = Math.min(x + 18, window.innerWidth  - hoverCard.offsetWidth  - 10) + 'px';
      hoverCard.style.top  = Math.min(y - 10,  window.innerHeight - hoverCard.offsetHeight - 10) + 'px';
    }}
    return;
  }}
  hoverThrottle = now;

  // drillPick pierces Google 3D tile mesh to reach EUBUCCO entities underneath
  const hits = viewer.scene.drillPick(movement.endPosition, 10);
  let found = null;
  for (const h of hits) {{
    if (h && h.id && h.id._dataIdx !== undefined) {{ found = h; break; }}
  }}

  if (found) {{
    const idx = found.id._dataIdx;
    const x = movement.endPosition.x, y = movement.endPosition.y;
    hoverCard.style.left = Math.min(x + 18, window.innerWidth  - 300) + 'px';
    hoverCard.style.top  = Math.min(y - 10,  window.innerHeight - 200) + 'px';

    if (idx === lastHoverId) {{ hoverCard.style.display = 'block'; return; }}
    lastHoverId = idx;
    const b = DATA[idx];
    const isResidential = RESIDENTIAL.has(b.use_cat);
    const eclassColor = b.eclass ? (ECLASS_COLORS_CSS[b.eclass] || '#94a3b8') : '#94a3b8';
    const tabulaLabel = b.tabula_period ? (TABULA_LABELS[b.tabula_period] || b.tabula_period) : null;

    let html = '<div style="font-weight:600;font-size:13px;margin-bottom:4px;color:#c4b5fd">' +
      (b.address || b.all_addresses || 'Building') + '</div>';
    // Show all addresses if multiple units share this EPC
    if (b.all_addresses && b.all_addresses !== b.address && b.all_addresses.includes(',')) {{
      html += '<div style="font-size:10px;color:#94a3b8;margin-bottom:5px">' + b.all_addresses + '</div>';
    }}
    const useLabel = b.use_cat ? b.use_cat.replace(/_/g,' ') : 'Unknown';
    html += '<div style="margin-bottom:6px"><span style="background:rgba(114,28,184,0.4);border-radius:4px;padding:2px 7px;font-size:11px">' + useLabel + '</span></div>';
    html += '<table style="width:100%;border-collapse:collapse">';
    const row = (lbl, val, color) => (val != null && val !== '') ?
      '<tr><td style="color:#94a3b8;padding:2px 0;white-space:nowrap">' + lbl + '</td>' +
      '<td style="text-align:right;padding:2px 0;font-weight:500' + (color?';color:'+color:'') + '">' + val + '</td></tr>' : '';
    if (b.eclass) html += row('Energy class','<span style="background:'+eclassColor+';color:#000;border-radius:3px;padding:1px 6px;font-weight:700">'+b.eclass+'</span>',null);
    if (b.energy) html += row('Energy use', b.energy+' kWh/m&#178;yr', b.energy>150?'#fb923c':'#4ade80');
    if (b.year)   html += row('Year built', b.year, null);
    if (b.footprint_m2) html += row('Footprint', Math.round(b.footprint_m2)+' m&#178;', null);
    if (b.height) html += row('Height', Math.round(b.height)+' m', null);
    if (b.floors) html += row('Floors', b.floors, null);
    if (isResidential && tabulaLabel) {{
      html += '<tr><td colspan="2" style="padding-top:6px;padding-bottom:2px;color:#94a3b8;font-size:10px;text-transform:uppercase;letter-spacing:.5px">TABULA Archetype</td></tr>';
      html += row('Era', tabulaLabel, '#a78bfa');
      if (b.tabula_u_wall) html += row('U-wall', b.tabula_u_wall+' W/m&#178;K', null);
      if (b.tabula_u_win)  html += row('U-window', b.tabula_u_win+' W/m&#178;K', null);
    }}
    html += '</table>';
    hoverCard.innerHTML = html;
    hoverCard.style.display = 'block';
  }} else {{
    hoverCard.style.display = 'none';
    lastHoverId = null;
  }}
}}, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

async function showInfoPanel(b, idx) {{
  selectedBuilding = {{ ...b, _idx: idx }};
  lastPvgis = null; lastWWR = null;
  // Enable analysis tool buttons
  document.getElementById('btn-inspect').disabled = false;
  document.getElementById('btn-pvgis').disabled   = false;
  document.getElementById('lp-no-selection').style.display = 'none';
  // Reset PVGIS result and saved badges when switching buildings
  const pvr = document.getElementById('pvgis-result');
  pvr.style.display = 'none'; pvr.innerHTML = '';
  document.getElementById('pvgis-saved-badge').style.display = 'none';
  document.getElementById('inspect-saved-badge').style.display = 'none';
  // Auto-load saved results for this building
  const bRing = b.coordinates && b.coordinates[0];
  if (bRing && bRing.length) {{
    const bLat = (bRing.reduce((s,c) => s+c[1], 0) / bRing.length).toFixed(5);
    const bLon = (bRing.reduce((s,c) => s+c[0], 0) / bRing.length).toFixed(5);
    try {{
      const [pvRes, wwrRes] = await Promise.all([
        fetch(`http://localhost:8000/api/pvgis-lookup?lat=${{bLat}}&lon=${{bLon}}`).then(r=>r.json()),
        fetch(`http://localhost:8000/api/wwr-lookup?lat=${{bLat}}&lon=${{bLon}}`).then(r=>r.json()),
      ]);
      if (pvRes.found) {{
        const r = pvRes.record;
        const mwh = (r.annual_kwh / 1000).toFixed(1);
        const badge = document.getElementById('pvgis-saved-badge');
        badge.innerHTML = '&#128190; Saved: ' + mwh + ' MWh/yr · ' + r.kWp + ' kWp';
        badge.style.display = 'block';
      }}
      if (wwrRes.found) {{
        const r = wwrRes.record;
        const badge = document.getElementById('inspect-saved-badge');
        badge.innerHTML = '&#128190; Saved WWR: ' + r.average_wwr + '% (AI)';
        badge.style.display = 'block';
      }}
    }} catch(e) {{ /* lookup not critical */ }}
  }}
  const rows = [];
  const row = (l,v) => v != null && v !== '' ? rows.push('<div class="tt-row"><span class="tt-lbl">'+l+'</span><span class="tt-val">'+v+'</span></div>') : null;
  row('Address',  b.address);
  row('Use',      b.use_cat ? b.use_cat.replace(/_/g,' ') : null);
  row('Energy class', b.eclass);
  row('Energy',   b.energy ? b.energy + ' kWh/m²' : null);
  row('Year',     b.year);
  row('Footprint', b.footprint_m2 ? Math.round(b.footprint_m2) + ' m²' : null);
  row('Height',   b.height ? Math.round(b.height) + ' m' : null);
  row('Floors',   b.floors);
  row('Period',   b.tabula_period);
  row('U-wall',   b.tabula_u_wall ? b.tabula_u_wall + ' W/m²K' : null);
  row('U-win',    b.tabula_u_win  ? b.tabula_u_win  + ' W/m²K' : null);
  document.getElementById('info-content').innerHTML = rows.join('');
  document.getElementById('info-panel').style.display = 'block';

  // Highlight outline
  if (highlightEntity) viewer.entities.remove(highlightEntity);
  const ring = b.coordinates[0];
  if (ring && ring.length >= 3) {{
    const flat = [];
    for (const [lo, la] of ring) {{ flat.push(lo, la); }}
    highlightEntity = viewer.entities.add({{
      polygon: {{
        hierarchy: new Cesium.PolygonHierarchy(Cesium.Cartesian3.fromDegreesArray(flat)),
        extrudedHeight: Math.max(3, b.height || 6) + 0.5,
        height: 0,
        material: Cesium.Color.fromCssColorString('#a78bfa').withAlpha(0.0),
        outline: true,
        outlineColor: Cesium.Color.fromCssColorString('#a78bfa'),
        outlineWidth: 3,
      }},
    }});
  }}
}}

function hideInfoPanel() {{
  document.getElementById('info-panel').style.display = 'none';
  if (highlightEntity) {{ viewer.entities.remove(highlightEntity); highlightEntity = null; }}
  selectedBuilding = null;
  // Disable analysis tool buttons
  document.getElementById('btn-inspect').disabled = true;
  document.getElementById('btn-pvgis').disabled   = true;
  document.getElementById('lp-no-selection').style.display = 'block';
}}

document.getElementById('info-close').addEventListener('click', hideInfoPanel);

// ─────────────────────────────────────────────────────────────────
// Facade Inspector
// ─────────────────────────────────────────────────────────────────
let facadeBuilding = null;
let lastPvgis = null;   // last successfully computed PVGIS result
let lastWWR   = null;   // last AI WWR result
const DIRS = ['N','E','S','W'];
const DIR_HEADINGS = {{ N:0, E:90, S:180, W:270 }};

document.getElementById('btn-pvgis').addEventListener('click', () => {{
  if (!selectedBuilding) return;
  fetchPVGIS(selectedBuilding);
}});

// NOTE: All innerHTML strings below use double-quotes (") for HTML attribute
// values — never single quotes. A ' before > would terminate the JS string.
async function fetchPVGIS(b) {{
  const el = document.getElementById('pvgis-result');
  if (!b.footprint_m2 || !b.coordinates) {{
    el.style.display = 'block';
    el.innerHTML = '<span style="color:#f87171">No footprint data available</span>';
    return;
  }}
  const ring = b.coordinates[0];
  let sumLon = 0, sumLat = 0;
  for (const [lo, la] of ring) {{ sumLon += lo; sumLat += la; }}
  const lat = (sumLat / ring.length).toFixed(5);
  const lon = (sumLon / ring.length).toFixed(5);
  const kWp = Math.round(b.footprint_m2 * 0.7 * 0.2 * 10) / 10;
  el.style.display = 'block';
  el.innerHTML = '<span style="color:#94a3b8">Fetching PVGIS\u2026</span>';
  try {{
    const url = `http://localhost:8000/api/pvgis?lat=${{lat}}&lon=${{lon}}&peakpower=${{kWp}}&loss=14&angle=35&aspect=0`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const Ey = data.outputs && data.outputs.totals && data.outputs.totals.fixed && data.outputs.totals.fixed.E_y;
    if (!Ey) throw new Error('No yield data in response');
    const totalKwh = Math.round(Ey * kWp);
    const mwh = (totalKwh / 1000).toFixed(1);
    lastPvgis = {{ lat: parseFloat(lat), lon: parseFloat(lon), kWp, Ey, totalKwh, mwh, b }};
    el.innerHTML =
      '<div style="color:#000000;font-weight:700;margin-bottom:4px">&#9728; Rooftop PV (PVGIS)</div>' +
      '<div style="display:grid;grid-template-columns:1fr auto;gap:2px 8px;color:#000000">' +
      '<span>System size</span><span style="font-weight:600">' + kWp + ' kWp</span>' +
      '<span>Annual yield</span><span style="color:#16a34a;font-weight:700">' + mwh + ' MWh/yr</span>' +
      '<span>Specific yield</span><span style="font-weight:600">' + Math.round(Ey) + ' kWh/kWp</span>' +
      '<span>Usable roof</span><span style="font-weight:600">' + Math.round(b.footprint_m2 * 0.7) + ' m\u00b2</span>' +
      '</div>' +
      '<button onclick="savePVGIS()" style="margin-top:8px;width:100%;padding:4px 8px;font-size:10px;' +
      'border-radius:6px;border:1px solid rgba(245,158,11,0.5);background:rgba(245,158,11,0.12);' +
      'color:#92400e;cursor:pointer;font-family:inherit">&#128190; Save PV result</button>' +
      '<div id="pvgis-save-status" style="font-size:10px;color:var(--muted);margin-top:3px"></div>';
  }} catch(e) {{
    const _netErr = (e instanceof TypeError) || (e.message || '').toLowerCase().includes('fetch');
    const _msg = _netErr
      ? '&#9888; Backend not running — restart with: python launch.py'
      : 'PVGIS error: ' + e.message;
    el.innerHTML = '<span style="color:#f87171">' + _msg + '</span>';
  }}
}}

async function savePVGIS() {{
  if (!lastPvgis) return;
  const {{ lat, lon, kWp, Ey, totalKwh, b }} = lastPvgis;
  const statusEl = document.getElementById('pvgis-save-status');
  if (statusEl) statusEl.textContent = 'Saving…';
  try {{
    await fetch('http://localhost:8000/api/pvgis-save', {{
      method: 'POST',
      headers: {{'Content-Type':'application/json'}},
      body: JSON.stringify({{
        lat, lon,
        address: b.address || null,
        kWp,
        annual_kwh: Math.round(Ey * kWp),
        specific_kwh_kwp: Math.round(Ey),
        roof_area_m2: Math.round(b.footprint_m2 * 0.7),
        building_info: {{ year: b.year, use: b.use_cat, eclass: b.eclass }},
      }}),
    }});
    if (statusEl) statusEl.textContent = '\u2713 Saved';
    // Update sidebar badge
    const badge = document.getElementById('pvgis-saved-badge');
    badge.innerHTML = '&#128190; Saved: ' + lastPvgis.mwh + ' MWh/yr · ' + kWp + ' kWp';
    badge.style.display = 'block';
  }} catch(e) {{
    if (statusEl) statusEl.textContent = 'Save failed: ' + e.message;
  }}
}}

document.getElementById('btn-inspect').addEventListener('click', () => {{
  if (!selectedBuilding) return;
  facadeBuilding = selectedBuilding;
  document.getElementById('info-panel').style.display = 'none';
  document.getElementById('facade-panel').style.display = 'block';
  document.getElementById('wwr-panel').style.display = 'block';
  // Clear canvases
  for (const d of DIRS) {{
    const ctx = document.getElementById('canvas-'+d).getContext('2d');
    ctx.fillStyle = '#1a1a2e'; ctx.fillRect(0,0,200,150);
    ctx.fillStyle = '#475569'; ctx.font = '11px Inter';
    ctx.textAlign = 'center'; ctx.fillText('Click to capture', 100, 75);
  }}
  // Fly to first facade
  flyToFacade('N');
  // Show heuristic WWR immediately
  showWWR(heuristicWWR(facadeBuilding), null, 'heuristic', null);
}});

function getBuildingCenter(b) {{
  const ring = b.coordinates[0];
  let lo = 0, la = 0;
  for (const [x, y] of ring) {{ lo += x; la += y; }}
  return {{ lon: lo / ring.length, lat: la / ring.length }};
}}

function getBuildingRadius(b) {{
  const ring = b.coordinates[0];
  const c = getBuildingCenter(b);
  let maxDeg = 0;
  for (const [x, y] of ring) {{
    const d = Math.sqrt((x-c.lon)**2 + (y-c.lat)**2);
    if (d > maxDeg) maxDeg = d;
  }}
  // Convert degrees to approx metres at this latitude
  return Math.max(15, maxDeg * 111320 * Math.cos(c.lat * Math.PI / 180));
}}

function flyToFacade(dir) {{
  if (!facadeBuilding) return;
  const c = getBuildingCenter(facadeBuilding);
  const r = getBuildingRadius(facadeBuilding);
  const dist = r * 3.5;
  const h = DIR_HEADINGS[dir] * Math.PI / 180;
  const offsetLon = Math.sin(h) * dist / (111320 * Math.cos(c.lat * Math.PI/180));
  const offsetLat = Math.cos(h) * dist / 111320;
  const bldH = Math.max(3, facadeBuilding.height || 6);
  viewer.camera.flyTo({{
    destination: Cesium.Cartesian3.fromDegrees(c.lon + offsetLon, c.lat + offsetLat, bldH * 0.6),
    orientation: {{
      heading: Cesium.Math.toRadians(DIR_HEADINGS[dir] + 180),
      pitch:   Cesium.Math.toRadians(-5),
      roll: 0,
    }},
    duration: 1.2,
  }});
  // Highlight active thumb
  for (const d of DIRS) document.getElementById('thumb-'+d).classList.remove('active');
  document.getElementById('thumb-'+dir).classList.add('active');
}}

// Capture facade
function captureToCanvas(dir) {{
  flyToFacade(dir);
  setTimeout(() => {{
    viewer.render();
    const srcCanvas = viewer.canvas;
    const dstCanvas = document.getElementById('canvas-'+dir);
    const ctx = dstCanvas.getContext('2d');
    ctx.drawImage(srcCanvas, 0, 0, srcCanvas.width, srcCanvas.height,
                  0, 0, dstCanvas.width, dstCanvas.height);
  }}, 1400);
}}

// Visual WWR from canvas pixel analysis
function analyseCanvasWWR(canvas) {{
  const ctx = canvas.getContext('2d');
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let windowPx = 0, wallPx = 0;
  // Heuristic: dark-grey/reflective = window; warm/opaque = wall
  for (let i = 0; i < imgData.length; i += 4) {{
    const r = imgData[i], g = imgData[i+1], b = imgData[i+2];
    const bright = (r + g + b) / 3;
    const sat = Math.max(r,g,b) - Math.min(r,g,b);
    if (bright < 90 && sat < 30) windowPx++;   // dark unsaturated = window/glass
    else if (bright > 40)        wallPx++;
  }}
  const total = windowPx + wallPx;
  return total > 0 ? Math.round((windowPx / total) * 100) : null;
}}

document.getElementById('btn-capture-all').addEventListener('click', async () => {{
  document.getElementById('facade-sub').textContent = 'Capturing all 4 facades…';
  document.getElementById('wwr-ai-status').textContent = '';
  const capturedB64 = {{}};
  for (const dir of DIRS) {{
    await new Promise(resolve => {{
      flyToFacade(dir);
      setTimeout(() => {{
        viewer.render();
        const src = viewer.canvas;
        const dst = document.getElementById('canvas-'+dir);
        const ctx = dst.getContext('2d');
        ctx.drawImage(src,0,0,src.width,src.height,0,0,dst.width,dst.height);
        // Convert to base64 JPEG for GPT-4 vision
        capturedB64[dir] = dst.toDataURL('image/jpeg', 0.85).split(',')[1];
        resolve();
      }}, 1500);
    }});
  }}
  document.getElementById('facade-sub').textContent = 'Captured – sending to GPT-4 vision…';
  document.getElementById('wwr-ai-status').textContent = '⏳ Analysing with GPT-4 vision…';

  const hWWR = heuristicWWR(facadeBuilding);
  const aiWWRs = [];
  const aiNotes = [];

  let _backendDown = false;
  for (const dir of DIRS) {{
    try {{
      const resp = await fetch('http://localhost:8000/api/estimate-wwr', {{
        method: 'POST',
        headers: {{'Content-Type':'application/json'}},
        body: JSON.stringify({{
          image_base64: capturedB64[dir],
          direction: dir,
          building_info: {{
            address: facadeBuilding.address,
            year: facadeBuilding.year,
            use: facadeBuilding.use_cat,
            eclass: facadeBuilding.eclass,
          }},
        }}),
      }});
      const result = await resp.json();
      aiWWRs.push(result.wwr);
      aiNotes.push(dir + ': ' + result.wwr + '%' + (result.confidence ? ' (' + result.confidence + ')' : ''));
    }} catch(e) {{
      const _netErr = (e instanceof TypeError) || (e.message || '').toLowerCase().includes('fetch');
      if (_netErr) _backendDown = true;
      aiWWRs.push(hWWR);
      aiNotes.push(dir + ': fallback');
    }}
  }}

  document.getElementById('facade-sub').textContent = 'Analysis complete';
  if (_backendDown) {{
    document.getElementById('wwr-ai-status').textContent =
      '\u26a0 Backend not running \u2014 restart with: python launch.py';
    showWWR(hWWR, null, 'heuristic', null);
  }} else {{
    const aiAvg = Math.round(aiWWRs.reduce((a,b)=>a+b,0) / aiWWRs.length);
    document.getElementById('wwr-ai-status').textContent = '';
    showWWR(aiAvg, aiWWRs, 'gpt4-vision', aiNotes);
  }}
}});

// Thumb click → fly + capture
for (const dir of DIRS) {{
  document.getElementById('thumb-'+dir).addEventListener('click', () => captureToCanvas(dir));
}}

// NOTE: All innerHTML strings below use double-quotes (") for HTML attribute
// values — never single quotes. A ' before > would terminate the JS string.
function showWWR(wwr, perFacade, source, notes) {{
  document.getElementById('wwr-value').textContent = wwr;
  document.getElementById('wwr-bar').style.width = Math.min(100, wwr * 1.4) + '%';

  // Always show TABULA reference
  if (facadeBuilding) {{
    const tWWR = heuristicWWR(facadeBuilding);
    const period = facadeBuilding.tabula_period || '–';
    document.getElementById('wwr-tabula-val').textContent = tWWR;
    document.getElementById('wwr-tabula-period').textContent = period;
    document.getElementById('wwr-tabula-row').style.display = 'block';
  }}

  let breakdown = '';
  if (source === 'heuristic') {{
    breakdown = 'Source: TABULA heuristic only (capture facades for AI estimate)';
  }} else if (source === 'gpt4-vision') {{
    // Track for saving
    lastWWR = {{ wwr, perFacade, notes, source }};
    breakdown = '&#129302; GPT-4 vision per facade:<br>';
    if (notes) breakdown += notes.join(' &nbsp;\xb7&nbsp; ');
  }} else {{
    breakdown = 'Source: ' + source;
    if (perFacade) breakdown += '<br>Per facade: ' + DIRS.map((d,i) => d+':'+perFacade[i]+'%').join(' ');
  }}
  document.getElementById('wwr-breakdown').innerHTML = breakdown;
  // Show save button only for AI results
  const aiStatus = document.getElementById('wwr-ai-status');
  if (source === 'gpt4-vision') {{
    aiStatus.innerHTML =
      '<button onclick="saveWWR()" style="margin-top:4px;width:100%;padding:4px 8px;font-size:10px;' +
      'border-radius:6px;border:1px solid rgba(139,92,246,0.5);background:rgba(139,92,246,0.1);' +
      'color:#6d28d9;cursor:pointer;font-family:inherit">&#128190; Save WWR result</button>' +
      '<div id="wwr-save-status" style="font-size:10px;color:var(--muted);margin-top:3px"></div>';
  }} else {{
    aiStatus.innerHTML = '';
  }}
}}

async function saveWWR() {{
  if (!lastWWR || !facadeBuilding) return;
  const statusEl = document.getElementById('wwr-save-status');
  if (statusEl) statusEl.textContent = 'Saving…';
  const ring = facadeBuilding.coordinates && facadeBuilding.coordinates[0];
  if (!ring) return;
  const lat = ring.reduce((s,c) => s+c[1], 0) / ring.length;
  const lon = ring.reduce((s,c) => s+c[0], 0) / ring.length;
  try {{
    await fetch('http://localhost:8000/api/wwr-save', {{
      method: 'POST',
      headers: {{'Content-Type':'application/json'}},
      body: JSON.stringify({{
        lat, lon,
        address: facadeBuilding.address || null,
        average_wwr: lastWWR.wwr,
        per_facade: lastWWR.perFacade || [],
        directions: DIRS,
        source: lastWWR.source,
        building_info: {{ year: facadeBuilding.year, use: facadeBuilding.use_cat, eclass: facadeBuilding.eclass }},
      }}),
    }});
    if (statusEl) statusEl.textContent = '\u2713 Saved';
    // Update sidebar badge
    const badge = document.getElementById('inspect-saved-badge');
    badge.innerHTML = '&#128190; Saved WWR: ' + lastWWR.wwr + '% (AI)';
    badge.style.display = 'block';
  }} catch(e) {{
    if (statusEl) statusEl.textContent = 'Save failed: ' + e.message;
  }}
}}

document.getElementById('btn-exit-inspect').addEventListener('click', () => {{
  document.getElementById('facade-panel').style.display = 'none';
  document.getElementById('wwr-panel').style.display = 'none';
  facadeBuilding = null;
  viewer.camera.flyTo({{
    destination: Cesium.Cartesian3.fromDegrees({cx:.6f}, {cy:.6f}, 1800),
    orientation: {{ heading:0, pitch:Cesium.Math.toRadians(-50), roll:0 }},
    duration: 1.5,
  }});
}});

// ─────────────────────────────────────────────────────────────────
// Color mode toggle
// ─────────────────────────────────────────────────────────────────
function setColorMode(mode) {{
  colorMode = mode;
  ['use','eclass','year'].forEach(m => {{
    document.getElementById('btn-'+m).classList.toggle('active', m === mode);
  }});
  updateLegend(mode);
  rebuildBuildings();
}}
document.getElementById('btn-use').addEventListener('click',    () => setColorMode('use'));
document.getElementById('btn-eclass').addEventListener('click', () => setColorMode('eclass'));
document.getElementById('btn-year').addEventListener('click',   () => setColorMode('year'));

// Initialise legend for default mode
updateLegend('use');

// ─────────────────────────────────────────────────────────────────
// Reset view
// ─────────────────────────────────────────────────────────────────
document.getElementById('btn-reset').addEventListener('click', () => {{
  viewer.camera.flyTo({{
    destination: Cesium.Cartesian3.fromDegrees({cx:.6f}, {cy:.6f}, 800),
    orientation: {{ heading:0, pitch:Cesium.Math.toRadians(-40), roll:0 }},
    duration: 1.5,
  }});
}});

// ─────────────────────────────────────────────────────────────────
// Address search (Nominatim)
// ─────────────────────────────────────────────────────────────────
const searchInput   = document.getElementById('search-input');
const searchBtn     = document.getElementById('search-btn');
const searchResults = document.getElementById('search-results');

async function geocodeAddress() {{
  const q = searchInput.value.trim();
  if (!q) return;
  searchBtn.textContent = '…';
  try {{
    const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=6&q=' +
                encodeURIComponent(q + ' Gothenburg');
    const data = await (await fetch(url)).json();
    if (!data.length) {{ searchResults.innerHTML='<div class="result-item">No results</div>'; searchResults.style.display='block'; return; }}
    searchResults.innerHTML = data.map((r,i) =>
      '<div class="result-item" data-idx="'+i+'">'+r.display_name+'</div>'
    ).join('');
    searchResults.style.display = 'block';
    searchResults._data = data;
  }} catch(e) {{
    searchResults.innerHTML = '<div class="result-item">Search failed</div>';
    searchResults.style.display = 'block';
  }} finally {{
    searchBtn.textContent = '&#128269; Search';
  }}
}}

searchBtn.addEventListener('click', geocodeAddress);
searchInput.addEventListener('keydown', e => {{ if (e.key==='Enter') geocodeAddress(); }});
searchResults.addEventListener('click', e => {{
  const item = e.target.closest('.result-item');
  if (!item) return;
  const r = searchResults._data[parseInt(item.dataset.idx)];
  viewer.camera.flyTo({{
    destination: Cesium.Cartesian3.fromDegrees(parseFloat(r.lon), parseFloat(r.lat), 300),
    orientation: {{ heading:0, pitch:Cesium.Math.toRadians(-45), roll:0 }},
    duration: 1.5,
  }});
  searchResults.style.display = 'none';
}});
document.addEventListener('click', e => {{
  if (!document.getElementById('search-wrap').contains(e.target))
    searchResults.style.display = 'none';
}});
</script>
</body>
</html>
"""

os.makedirs("assets", exist_ok=True)
with open(OUTPUT_HTML, "w", encoding="utf-8", errors="replace") as f:
    f.write(html)

# Also write buildings.json (used by backend API and frontend public folder)
# Sanitize NaN/Inf → None before serializing so JSON is strictly valid
def _sanitize_records(obj):
    if isinstance(obj, float) and (obj != obj or obj == float("inf") or obj == float("-inf")):
        return None
    if isinstance(obj, dict):
        return {k: _sanitize_records(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_sanitize_records(v) for v in obj]
    return obj

_clean_records = _sanitize_records(records)
_buildings_json_str = json.dumps(_clean_records, ensure_ascii=False)
for _bj_path in ["assets/buildings.json", "frontend/public/buildings.json"]:
    os.makedirs(os.path.dirname(_bj_path) if os.path.dirname(_bj_path) else ".", exist_ok=True)
    with open(_bj_path, "w", encoding="utf-8") as _f:
        _f.write(_buildings_json_str)
print(f"Updated: assets/buildings.json + frontend/public/buildings.json  (footprint_m2 included)")

file_size_mb = os.path.getsize(OUTPUT_HTML) / 1e6
print(f"\nSaved: {OUTPUT_HTML}  ({file_size_mb:.1f} MB)")
print(f"   Open in a browser:  {os.path.abspath(OUTPUT_HTML)}")
print(f"\nStats:")
print(f"   Buildings : {n_total:,}")
print(f"   Use distribution:\n{gdf['use_cat'].value_counts().to_string()}")