"""
3D Building Extrusion Map – Gothenburg (SE23)
Uses pydeck PolygonLayer with extruded=True, height driven by EUBUCCO 'height' field.
Outputs a standalone HTML file you can open in any browser.

Usage:
    python visualize_3d_buildings.py
Output:
    assets/gothenburg_3d.html
"""

import geopandas as gpd
import pandas as pd
import numpy as np
import json
import os
from pathlib import Path

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
PARQUET_PATH = "data/eubucco/SE23.parquet"
GPKG_PATH    = "data/eubucco/SE23.gpkg"
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
    SELECT
        f.FormularId,
        f.geom,
        f.andamal1,
        f.fastighetsbeteckning,
        e.year_built,
        e.floors_epc,
        e.area_atemp,
        e.energy_kwh_m2,
        e.energy_class,
        e.address
    FROM footprints f
    LEFT JOIN (
        SELECT
            FormularId,
            MIN(EgenNybyggAr)              AS year_built,
            MIN(EgenAntalPlan)             AS floors_epc,
            MIN(EgenAtemp)                AS area_atemp,
            MIN(EgiSpecifikEnergianvandning) AS energy_kwh_m2,
            MIN(EgiEnergiklass)            AS energy_class,
            MIN(IdAdr)                    AS address
        FROM epc
        GROUP BY FormularId
    ) e ON f.FormularId = e.FormularId
""").fetchdf()
con.close()

epc_raw["geometry"] = epc_raw["geom"].apply(lambda b: shapely_wkb.loads(bytes(b)))
epc_cols = ["FormularId", "andamal1", "fastighetsbeteckning", "year_built", "floors_epc", "area_atemp", "energy_kwh_m2", "energy_class", "address", "geometry"]
epc_gdf = gpd.GeoDataFrame(epc_raw[epc_cols], crs="EPSG:4326")

# Project both datasets to EPSG:3006 (metric CRS) for accurate distance matching
epc_3006 = epc_gdf.to_crs("EPSG:3006")
gdf_3006 = gdf.to_crs("EPSG:3006")

# Use representative_point() — guaranteed to be inside even complex MultiPolygons
epc_pts = epc_3006.copy()
epc_pts["geometry"] = epc_3006.geometry.representative_point()

# Crop EPC points to bbox (with small buffer for edge buildings)
bbox_poly = gpd.GeoDataFrame(
    geometry=gpd.GeoSeries.from_wkt(
        [f"POLYGON(({LON_MIN} {LAT_MIN},{LON_MAX} {LAT_MIN},{LON_MAX} {LAT_MAX},{LON_MIN} {LAT_MAX},{LON_MIN} {LAT_MIN}))"]
    ), crs="EPSG:4326"
).to_crs("EPSG:3006").geometry.iloc[0]
epc_pts = epc_pts[epc_pts.geometry.within(bbox_poly.buffer(200))].copy()
print(f"  EPC footprints in bbox: {len(epc_pts):,}")

# Step 1: exact sjoin — EPC point falls inside a EUBUCCO polygon
gdf_3006_idx = gdf_3006[["geometry"]].copy().reset_index().rename(columns={"index": "eubucco_idx"})
joined_exact = gpd.sjoin(epc_pts, gdf_3006_idx, how="inner", predicate="within")

# Step 2: nearest-neighbour join for the remaining unmatched EPC points
#   (handles cases where EPC and EUBUCCO footprints are slightly offset)
MAX_DIST_M = 25  # max 25 m to nearest EUBUCCO polygon centroid
matched_epc_ids = set(joined_exact.index)
epc_unmatched = epc_pts[~epc_pts.index.isin(matched_epc_ids)].copy()
joined_nearest = gpd.sjoin_nearest(
    epc_unmatched, gdf_3006_idx,
    how="inner", max_distance=MAX_DIST_M, distance_col="dist_m"
)
# Drop duplicates from nearest — keep closest match per EPC point
joined_nearest = joined_nearest.sort_values("dist_m").drop_duplicates(subset=[joined_nearest.index.name or "FormularId"])

# Combine exact + nearest matches
EXTRA_COLS = ["andamal1", "fastighetsbeteckning", "year_built", "floors_epc", "area_atemp", "energy_kwh_m2", "energy_class", "address", "eubucco_idx"]
joined = pd.concat([
    joined_exact[[c for c in EXTRA_COLS if c in joined_exact.columns]],
    joined_nearest[[c for c in EXTRA_COLS if c in joined_nearest.columns]],
], ignore_index=False)

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
    if year is None or (isinstance(year, float) and np.isnan(year)):
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
n_exact = len(joined_exact)
n_near  = len(joined_nearest)
print(f"  Matched {matched:,} of {len(gdf):,} buildings to EPC use ({matched/len(gdf)*100:.1f}%)")
print(f"  (exact 'within': {n_exact:,} EPC pts | nearest <={MAX_DIST_M}m: {n_near:,} EPC pts)")
print(f"  Top andamal1 values:")
print(joined["andamal1"].value_counts().head(10).to_string())

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
    fastbet  = row.get("fastighet_epc", None)
    # Strip apartment suffix (e.g. 'Mandolingatan 80 LGH 1001' -> 'Mandolingatan 80')
    if addr and addr == addr:
        import re
        addr = re.sub(r'\s+(LGH|lgh|ANL|LOKAL|KONTOR|GAR|P-PLATS).*$', '', str(addr)).strip()
    else:
        addr = None
    # Fallback to fastighetsbeteckning if no street address
    display_addr = addr if addr else (str(fastbet).strip() if fastbet and fastbet == fastbet and str(fastbet).strip() else None)
    def _safe_int(v):  return int(v) if v is not None and v == v else None
    def _safe_f1(v):   return round(float(v), 1) if v is not None and v == v else None
    records.append({
        "coordinates": row["coordinates"],
        "height":      round(float(row["elev"]), 1),
        "color":       row["color"],
        "floors":      _safe_f1(fl_epc),
        "year":        _safe_int(yr_epc),
        "area":        _safe_int(area),
        "energy":      _safe_f1(enrg),
        "eclass":      str(eklass) if eklass and eklass == eklass else None,
        "eclass_color": ECLASS_COLORS.get(str(eklass).strip().upper(), None) if eklass and eklass == eklass else None,
        "has_epc":     bool(andamal and andamal == andamal),
        "andamal":     str(andamal) if andamal and andamal == andamal else None,
        "use_cat":     use,
        "address":     display_addr,
        "tabula_period":  row.get("tabula_period", None),
        "tabula_u_wall":  round(float(row["tabula_u_wall"]),  2) if row.get("tabula_u_wall")  is not None and row.get("tabula_u_wall")  == row.get("tabula_u_wall")  else None,
        "tabula_u_roof":  round(float(row["tabula_u_roof"]),  2) if row.get("tabula_u_roof")  is not None and row.get("tabula_u_roof")  == row.get("tabula_u_roof")  else None,
        "tabula_u_win":   round(float(row["tabula_u_win"]),   2) if row.get("tabula_u_win")   is not None and row.get("tabula_u_win")   == row.get("tabula_u_win")   else None,
        "tabula_heat_z3": round(float(row["tabula_heat_z3"]), 1) if row.get("tabula_heat_z3") is not None and row.get("tabula_heat_z3") == row.get("tabula_heat_z3") else None,
        "tabula_wall":    str(row["tabula_wall"]) if row.get("tabula_wall") and row.get("tabula_wall") == row.get("tabula_wall") else None,
        "tabula_roof":    str(row["tabula_roof"]) if row.get("tabula_roof") and row.get("tabula_roof") == row.get("tabula_roof") else None,
        "perf_pct":       round(float(row["perf_pct"]), 3) if row.get("perf_pct") is not None and row.get("perf_pct") == row.get("perf_pct") else None,
    })

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
        return {
            "addr":   r["_addr"],
            "energy": round(float(r["_energy"]), 0),
            "eclass": eklass,
            "use":    r.get("use_cat","ovrigt"),
            "area":   int(r["area_atemp_epc"]) if r.get("area_atemp_epc") and str(r.get("area_atemp_epc")) not in ("nan","None") else None,
        }
    period_cards_json[_p] = {
        "best":  [_row_to_card(r) for _, r in _sub_sorted.head(3).iterrows()],
        "worst": [_row_to_card(r) for _, r in _sub_sorted.tail(3).iloc[::-1].iterrows()],
    }

import json as _json
period_cards_js = _json.dumps(period_cards_json)

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
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/cesium@1.124.0/Build/Cesium/Widgets/widgets.css">
  <script>window.CESIUM_BASE_URL = 'https://cdn.jsdelivr.net/npm/cesium@1.124.0/Build/Cesium/';</script>
  <script src="https://cdn.jsdelivr.net/npm/cesium@1.124.0/Build/Cesium/Cesium.js"></script>
  <style>
    :root {{
      --navy:    #721CB8; --navy-dark:#421869; --teal:#995BD5;
      --lime:    #96D74C; --green:#509724;
      --surface: rgba(10,10,20,0.85); --border:rgba(114,28,184,0.3);
      --text:    #e2e8f0; --muted:#94a3b8; --faint:#475569;
      --radius:  14px;   --shadow:0 8px 40px rgba(0,0,0,0.6);
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

    /* left info panel */
    #left-panel {{ top:16px; left:16px; width:236px; }}

    /* controls bar */
    #controls {{
      position:absolute; bottom:24px; left:50%; transform:translateX(-50%);
      z-index:20; display:flex; gap:8px; flex-wrap:wrap; justify-content:center;
    }}
    .btn {{
      padding:7px 14px; border-radius:10px; border:1px solid var(--border);
      background:var(--surface); color:var(--text); font-size:12px; font-weight:500;
      cursor:pointer; backdrop-filter:blur(12px); transition:all .15s;
      white-space:nowrap;
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
               border-bottom:1px solid rgba(255,255,255,0.05); font-size:12px; }}
    .tt-lbl {{ color:var(--muted); }}
    .tt-val {{ color:#f1f5f9; font-weight:500; text-align:right; max-width:170px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }}

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
                     background:rgba(255,255,255,0.08); overflow:hidden; }}
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
    .legend-row:hover {{ color:#fff; }}
    .legend-dot {{ width:10px; height:10px; border-radius:3px; flex-shrink:0; }}
    .legend-cnt {{ margin-left:auto; color:var(--faint); }}

    /* search */
    #search-box {{
      position:absolute; top:16px; left:50%; transform:translateX(-50%);
      z-index:20; display:flex; gap:6px;
    }}
    #search-input {{
      width:260px; padding:8px 12px; border-radius:10px;
      border:1px solid var(--border); background:var(--surface);
      color:var(--text); font-size:13px; backdrop-filter:blur(12px);
      outline:none;
    }}
    #search-input:focus {{ border-color:#7c3aed; }}
    #search-results {{
      position:absolute; top:calc(100% + 6px); left:0; right:0;
      background:var(--surface); border:1px solid var(--border);
      border-radius:10px; backdrop-filter:blur(16px); display:none;
      max-height:240px; overflow-y:auto;
    }}
    .result-item {{ padding:8px 12px; cursor:pointer; font-size:12px; border-bottom:1px solid rgba(255,255,255,0.05); }}
    .result-item:hover {{ background:rgba(114,28,184,0.2); }}

    /* brand */
    #ppg-brand {{
      position:absolute; bottom:24px; right:20px; z-index:20;
      font-size:10px; font-weight:700; color:rgba(255,255,255,0.25);
      letter-spacing:.8px; text-transform:uppercase; pointer-events:none;
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

<!-- Search bar -->
<div id="search-box">
  <input id="search-input" type="text" placeholder="Search address…" autocomplete="off">
  <button class="btn" id="search-btn">&#128269; Search</button>
  <div id="search-results"></div>
</div>

<!-- Left info panel -->
<div class="panel" id="left-panel">
  <h2>&#127963; Gothenburg 3D</h2>
  <div class="sub">EUBUCCO v0.2 + EPC · {n_total:,} buildings</div>
  <div id="legend-container">
    <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Building use</div>
    {type_legend_html}
  </div>
</div>

<!-- Building info panel -->
<div class="panel" id="info-panel">
  <button class="close-btn" id="info-close">&#x2715;</button>
  <h2>&#127963; Building</h2>
  <div id="info-content"></div>
  <button class="btn" style="width:100%;margin-top:10px;font-size:12px" id="btn-inspect">
    &#128247; Inspect Facades + WWR
  </button>
</div>

<!-- Facade inspector -->
<div class="panel" id="facade-panel">
  <h2>&#128247; Facade Inspector</h2>
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
  <div id="wwr-breakdown" style="margin-top:8px;font-size:11px;color:var(--muted)"></div>
  <div style="margin-top:8px;font-size:10px;color:var(--faint)">
    Heuristic based on TABULA archetype · era · energy class.<br>
    Visual analysis from captured facade screenshots.
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

<!-- Controls -->
<div id="controls">
  <button class="btn active" id="btn-use">&#127968; Use type</button>
  <button class="btn" id="btn-eclass">&#9889; Energy class</button>
  <button class="btn" id="btn-year">&#128197; Year era</button>
  <button class="btn" id="btn-tiles">&#127759; Photorealistic Tiles</button>
  <button class="btn" id="btn-eubucco">&#127963; EUBUCCO Overlay</button>
  <button class="btn" id="btn-reset">&#8962; Reset view</button>
</div>

<div id="ppg-brand">PPG · Chalmers / Boverket</div>

<script>
// ─────────────────────────────────────────────────────────────────
// DATA
// ─────────────────────────────────────────────────────────────────
const DATA = {data_json};

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
    positiveX: 'https://cdn.jsdelivr.net/npm/cesium@1.124.0/Build/Cesium/Assets/Textures/SkyBox/tycho2t3_80_px.jpg',
    negativeX: 'https://cdn.jsdelivr.net/npm/cesium@1.124.0/Build/Cesium/Assets/Textures/SkyBox/tycho2t3_80_mx.jpg',
    positiveY: 'https://cdn.jsdelivr.net/npm/cesium@1.124.0/Build/Cesium/Assets/Textures/SkyBox/tycho2t3_80_py.jpg',
    negativeY: 'https://cdn.jsdelivr.net/npm/cesium@1.124.0/Build/Cesium/Assets/Textures/SkyBox/tycho2t3_80_my.jpg',
    positiveZ: 'https://cdn.jsdelivr.net/npm/cesium@1.124.0/Build/Cesium/Assets/Textures/SkyBox/tycho2t3_80_pz.jpg',
    negativeZ: 'https://cdn.jsdelivr.net/npm/cesium@1.124.0/Build/Cesium/Assets/Textures/SkyBox/tycho2t3_80_mz.jpg',
  }}
}});
viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#87CEEB');  // sky blue fallback

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
  const picked = viewer.scene.pick(movement.position);
  if (Cesium.defined(picked) && picked.id && picked.id._dataIdx !== undefined) {{
    const b = DATA[picked.id._dataIdx];
    if (b) showInfoPanel(b, picked.id._dataIdx);
  }} else {{
    hideInfoPanel();
  }}
}}, Cesium.ScreenSpaceEventType.LEFT_CLICK);

function showInfoPanel(b, idx) {{
  selectedBuilding = {{ ...b, _idx: idx }};
  const rows = [];
  const row = (l,v) => v != null && v !== '' ? rows.push('<div class="tt-row"><span class="tt-lbl">'+l+'</span><span class="tt-val">'+v+'</span></div>') : null;
  row('Address',  b.address);
  row('Use',      b.use_cat ? b.use_cat.replace(/_/g,' ') : null);
  row('Energy class', b.eclass);
  row('Energy',   b.energy ? b.energy + ' kWh/m²' : null);
  row('Year',     b.year);
  row('Area',     b.area  ? b.area  + ' m²' : null);
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
}}

document.getElementById('info-close').addEventListener('click', hideInfoPanel);

// ─────────────────────────────────────────────────────────────────
// Facade Inspector
// ─────────────────────────────────────────────────────────────────
let facadeBuilding = null;
const DIRS = ['N','E','S','W'];
const DIR_HEADINGS = {{ N:0, E:90, S:180, W:270 }};

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
  showWWR(heuristicWWR(facadeBuilding), null, 'heuristic');
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
  const visualWWRs = [];
  for (const dir of DIRS) {{
    await new Promise(resolve => {{
      flyToFacade(dir);
      setTimeout(() => {{
        viewer.render();
        const src = viewer.canvas;
        const dst = document.getElementById('canvas-'+dir);
        const ctx = dst.getContext('2d');
        ctx.drawImage(src,0,0,src.width,src.height,0,0,dst.width,dst.height);
        const w = analyseCanvasWWR(dst);
        if (w !== null) visualWWRs.push(w);
        resolve();
      }}, 1500);
    }});
  }}
  document.getElementById('facade-sub').textContent = 'Capture complete';
  const hWWR = heuristicWWR(facadeBuilding);
  if (visualWWRs.length > 0) {{
    const visualAvg = Math.round(visualWWRs.reduce((a,b) => a+b,0) / visualWWRs.length);
    // Weighted blend: 40% visual + 60% heuristic (visual is noisy from OSM tiles)
    const blended = Math.round(0.4 * visualAvg + 0.6 * hWWR);
    showWWR(blended, visualWWRs, 'blended');
  }} else {{
    showWWR(hWWR, null, 'heuristic');
  }}
}});

// Thumb click → fly + capture
for (const dir of DIRS) {{
  document.getElementById('thumb-'+dir).addEventListener('click', () => captureToCanvas(dir));
}}

function showWWR(wwr, perFacade, source) {{
  document.getElementById('wwr-value').textContent = wwr;
  document.getElementById('wwr-bar').style.width = Math.min(100, wwr * 1.4) + '%';
  let breakdown = source === 'heuristic'
    ? 'Source: TABULA archetype heuristic'
    : 'Source: blended (visual + heuristic)';
  if (perFacade) {{
    breakdown += '<br>Per facade: ' + DIRS.map((d,i) => d+':'+perFacade[i]+'%').join(' ');
  }}
  document.getElementById('wwr-breakdown').innerHTML = breakdown;
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
  rebuildBuildings();
}}
document.getElementById('btn-use').addEventListener('click',    () => setColorMode('use'));
document.getElementById('btn-eclass').addEventListener('click', () => setColorMode('eclass'));
document.getElementById('btn-year').addEventListener('click',   () => setColorMode('year'));

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
  if (!document.getElementById('search-box').contains(e.target))
    searchResults.style.display = 'none';
}});
</script>
</body>
</html>
"""

os.makedirs("assets", exist_ok=True)
with open(OUTPUT_HTML, "w", encoding="utf-8", errors="replace") as f:
    f.write(html)

file_size_mb = os.path.getsize(OUTPUT_HTML) / 1e6
print(f"\nSaved: {OUTPUT_HTML}  ({file_size_mb:.1f} MB)")
print(f"   Open in a browser:  {os.path.abspath(OUTPUT_HTML)}")
print(f"\nStats:")
print(f"   Buildings : {n_total:,}")
print(f"   Use distribution:\n{gdf['use_cat'].value_counts().to_string()}")