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
print(f"  (exact 'within': {n_exact:,} EPC pts | nearest ≤{MAX_DIST_M}m: {n_near:,} EPC pts)")
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
    epc_records.append({
        "coordinates": _coords,
        "andamal": str(_r["andamal1"]) if _r["andamal1"] and _r["andamal1"] == _r["andamal1"] else None,
        "eclass": _ek,
        "address": str(_r["address"]) if _r.get("address") and str(_r.get("address")).strip() not in ("","nan","None") else None,
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
  <title>Gothenburg 3D Buildings – EUBUCCO v0.2</title>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <script src="deck.gl.min.js"></script>
  <style>
    :root {{
      --navy:      #721CB8;
      --navy-dark: #421869;
      --teal:      #995BD5;
      --lime:      #96D74C;
      --green:     #509724;
      --surface:   rgba(10,10,20,0.82);
      --border:    rgba(114,28,184,0.22);
      --text:      #e2e8f0;
      --muted:     #94a3b8;
      --faint:     #475569;
      --radius:    14px;
      --shadow:    0 8px 40px rgba(0,0,0,0.55);
    }}
    * {{ margin:0; padding:0; box-sizing:border-box; }}
    body {{ font-family:'Inter',system-ui,sans-serif; background:#0f1117; color:var(--text); }}
    #map {{ position:relative; width:100vw; height:100vh; }}

    /* ── Shared panel shell ── */
    .ppg-panel {{
      position:absolute; top:16px; left:16px; z-index:10;
      background:var(--surface); backdrop-filter:blur(14px);
      border:1px solid var(--border); border-radius:var(--radius);
      padding:16px 18px; width:240px;
      box-shadow:var(--shadow);
      pointer-events:auto;
    }}
    .ppg-panel h2 {{
      font-size:12px; font-weight:700; color:var(--lime);
      margin-bottom:3px; letter-spacing:.6px; text-transform:uppercase;
    }}
    .ppg-panel .sub {{ font-size:11px; color:var(--muted); margin-bottom:12px; }}
    .stat {{ display:flex; justify-content:space-between; padding:5px 0; border-bottom:1px solid rgba(255,255,255,0.06); }}
    .stat .lbl {{ font-size:11px; color:var(--muted); }}
    .stat .val {{ font-size:12px; font-weight:600; color:#f1f5f9; }}
    .legend-title {{ font-size:11px; color:var(--muted); margin:12px 0 6px; text-transform:uppercase; letter-spacing:.4px; }}
    .legend {{ font-size:11px; color:#cbd5e1; }}

    /* ── Tooltip ── */
    #tooltip {{
      position:absolute; pointer-events:none; z-index:20;
      background:rgba(10,10,20,0.97); border:1px solid var(--border);
      border-radius:var(--radius); padding:12px 16px; font-size:12px; line-height:1.6;
      min-width:220px; max-width:300px; display:none;
      box-shadow:var(--shadow);
    }}
    .tt-title {{ font-size:13px; font-weight:700; color:var(--lime); margin-bottom:8px; border-bottom:1px solid rgba(255,255,255,0.08); padding-bottom:6px; }}
    .tt-row {{ display:flex; justify-content:space-between; gap:12px; padding:2px 0; }}
    .tt-lbl {{ color:var(--faint); font-size:11px; }}
    .tt-val {{ color:#e2e8f0; font-size:11px; font-weight:600; text-align:right; }}
    .tt-divider {{ border:none; border-top:1px solid rgba(255,255,255,0.07); margin:6px 0; }}

    /* ── Controls ── */
    #controls {{
      position:absolute; bottom:24px; left:50%; transform:translateX(-50%);
      z-index:10; display:flex; gap:8px; pointer-events:auto;
    }}
    .btn {{
      background:rgba(114,28,184,0.18); border:1px solid rgba(114,28,184,0.5);
      color:#c4b5fd; padding:7px 16px; border-radius:8px; cursor:pointer; font-size:12px;
      font-family:inherit; font-weight:500;
      transition:background 0.2s; backdrop-filter:blur(6px);
    }}
    .btn:hover {{ background:rgba(114,28,184,0.38); color:#fff; }}
    #hint {{
      position:absolute; bottom:68px; left:50%; transform:translateX(-50%);
      z-index:10; font-size:11px; color:var(--faint); text-align:center;
      white-space:nowrap;
    }}

    /* ── Branding badge ── */
    #ppg-brand {{
      position:absolute; bottom:24px; right:20px; z-index:10;
      display:flex; align-items:center; gap:8px;
      background:var(--surface); border:1px solid var(--border);
      border-radius:10px; padding:6px 12px;
      font-size:11px; font-weight:600; color:var(--lime);
      letter-spacing:.4px; backdrop-filter:blur(10px);
    }}
    #ppg-brand span {{ color:var(--muted); font-weight:400; }}

    /* ── Year-mode panel ── */
    #year-panel {{
      display:none;
    }}
    #year-panel h2 {{ color:var(--lime); }}
    #year-panel .sub {{ font-size:11px; color:var(--muted); margin-bottom:12px; }}
    .period-item {{
      display:flex; align-items:center; gap:8px; padding:6px 8px;
      border-radius:8px; cursor:pointer; transition:background 0.15s;
      margin:3px 0;
    }}
    .period-item:hover {{ background:rgba(150,215,76,0.08); }}
    .period-item.active {{ background:rgba(150,215,76,0.15); border:1px solid rgba(150,215,76,0.35); }}
    .period-swatch {{ width:12px; height:12px; border-radius:3px; flex-shrink:0; }}
    .period-label {{ font-size:11px; color:#cbd5e1; flex:1; }}
    .period-count {{ font-size:11px; color:var(--faint); }}
    #year-clear {{
      margin-top:10px; width:100%; font-size:11px; padding:5px 0;
      background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.1);
      border-radius:8px; color:var(--muted); cursor:pointer; font-family:inherit;
    }}
    #year-clear:hover {{ background:rgba(255,255,255,0.09); }}

    /* ── Energy extreme cards ── */
    #energy-cards {{
      margin-top:14px; display:none;
    }}
    #energy-cards .ec-header {{
      font-size:10px; font-weight:700; text-transform:uppercase;
      letter-spacing:.5px; color:var(--lime); margin-bottom:6px;
    }}
    .ec-section {{ margin-bottom:10px; }}
    .ec-section-title {{
      font-size:10px; color:var(--muted); text-transform:uppercase;
      letter-spacing:.4px; margin-bottom:4px;
    }}
    .ec-card {{
      padding:6px 8px; border-radius:8px; margin-bottom:4px;
      display:flex; align-items:center; gap:6px;
      background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.07);
    }}
    .ec-card.best {{ border-color:rgba(150,215,76,0.3); background:rgba(150,215,76,0.07); }}
    .ec-card.worst {{ border-color:rgba(239,68,68,0.3); background:rgba(239,68,68,0.06); }}
    .ec-addr {{ font-size:10px; color:#cbd5e1; flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }}
    .ec-badge {{
      font-size:9px; font-weight:700; padding:1px 5px; border-radius:4px;
      color:#000; flex-shrink:0;
    }}
    .ec-val {{ font-size:10px; font-weight:600; color:var(--muted); flex-shrink:0; }}

    /* ── Energy-class panel ── */
    #eclass-panel {{
      display:none;
    }}
    #eclass-panel h2 {{ color:var(--lime); }}
    #eclass-panel .sub {{ font-size:11px; color:var(--muted); margin-bottom:12px; }}
    .eclass-item {{
      display:flex; align-items:center; gap:8px; padding:5px 8px;
      border-radius:8px; cursor:pointer; transition:background 0.15s; margin:2px 0;
    }}
    .eclass-item:hover {{ background:rgba(150,215,76,0.08); }}
    .eclass-item.active {{ background:rgba(150,215,76,0.15); border:1px solid rgba(150,215,76,0.3); }}
    .eclass-swatch {{ width:12px; height:12px; border-radius:3px; flex-shrink:0; }}
    .eclass-label {{ font-size:11px; color:#cbd5e1; flex:1; }}
    .eclass-count {{ font-size:11px; color:var(--faint); }}
    #eclass-clear {{
      margin-top:10px; width:100%; font-size:11px; padding:5px 0;
      background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.1);
      border-radius:8px; color:var(--muted); cursor:pointer; font-family:inherit;
    }}
    #eclass-clear:hover {{ background:rgba(255,255,255,0.09); }}
    .no-epc-note {{ font-size:10px; color:var(--faint); margin-top:8px; line-height:1.4; }}

    /* ── Energy-compare sub-panel ── */
    #perf-legend {{ margin-top:12px; display:none; }}
    #perf-legend .perf-title {{ font-size:11px; color:var(--muted); margin-bottom:6px; text-transform:uppercase; letter-spacing:.4px; }}
    .perf-bar-wrap {{ position:relative; height:14px; border-radius:4px; overflow:visible; margin-bottom:4px; }}
    .perf-bar {{ height:100%; border-radius:4px; }}
    .perf-bar-labels {{ display:flex; justify-content:space-between; font-size:10px; color:var(--faint); }}
    #btn-energy-compare {{
      margin-top:10px; width:100%; font-size:11px; padding:6px 0;
      background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.1);
      border-radius:8px; color:var(--muted); cursor:pointer; transition:background 0.2s; font-family:inherit;
    }}
    #btn-energy-compare:hover  {{ background:rgba(255,255,255,0.09); }}
    #btn-energy-compare.active {{ background:rgba(150,215,76,0.12); border-color:rgba(150,215,76,0.4); color:var(--lime); }}

    /* ── Search bar ── */
    #search-box {{
      position:absolute; top:16px; right:16px; z-index:10;
      display:flex; flex-direction:column; gap:6px; width:300px;
      pointer-events:auto;
    }}
    #search-row {{ display:flex; gap:6px; }}
    #search-input {{
      flex:1; background:var(--surface); backdrop-filter:blur(14px);
      border:1px solid var(--border); border-radius:10px;
      padding:8px 12px; color:#e2e8f0; font-size:13px; font-family:inherit;
      outline:none; transition:border-color 0.2s;
    }}
    #search-input::placeholder {{ color:var(--faint); }}
    #search-input:focus {{ border-color:rgba(114,28,184,0.7); }}
    #search-btn {{
      background:rgba(114,28,184,0.25); border:1px solid rgba(114,28,184,0.5);
      border-radius:10px; color:#c4b5fd; padding:8px 14px; cursor:pointer;
      font-size:14px; transition:background 0.2s; backdrop-filter:blur(8px);
      white-space:nowrap;
    }}
    #search-btn:hover {{ background:rgba(114,28,184,0.45); }}
    #search-btn.loading {{ opacity:0.5; pointer-events:none; }}
    #search-results {{
      background:rgba(10,10,20,0.97); backdrop-filter:blur(14px);
      border:1px solid var(--border); border-radius:10px;
      overflow:hidden; display:none;
    }}
    .result-item {{
      padding:9px 12px; cursor:pointer; font-size:12px; color:#cbd5e1;
      border-bottom:1px solid rgba(255,255,255,0.05); transition:background 0.15s;
      line-height:1.4;
    }}
    .result-item:last-child {{ border-bottom:none; }}
    .result-item:hover {{ background:rgba(114,28,184,0.18); color:#e2e8f0; }}
    .result-item .result-name {{ font-weight:600; color:#e2e8f0; }}
    .result-item .result-addr {{ font-size:11px; color:var(--faint); margin-top:2px; }}
    #search-status {{
      font-size:11px; color:var(--faint); padding:6px 12px;
      background:var(--surface); border:1px solid var(--border);
      border-radius:10px; backdrop-filter:blur(14px); display:none;
    }}
  </style>
</head>
<body>
<div id="map"><canvas id="deck-canvas" style="position:absolute;inset:0;width:100%;height:100%"></canvas></div>

<!-- Cesium Globe overlay (lazy-loaded when first opened) -->
<div id="cesium-globe" style="display:none;position:fixed;inset:0;z-index:2000;background:#000;flex-direction:column">
  <div style="position:absolute;top:14px;right:14px;z-index:10;display:flex;gap:8px">
    <div style="color:#e2e8f0;font-size:13px;font-weight:600;padding:8px 14px;background:rgba(10,10,20,0.85);border-radius:10px;backdrop-filter:blur(12px);border:1px solid rgba(114,28,184,0.3)">
      🌍 Globe View — click a city pin to fly there
    </div>
    <button id="cesium-close" style="padding:8px 14px;border-radius:10px;background:rgba(114,28,184,0.7);color:#fff;border:none;cursor:pointer;font-size:13px;font-weight:600">✕ Close</button>
  </div>
  <div id="cesium-container" style="width:100%;height:100%"></div>
</div>
<div id="panel" class="ppg-panel">
  <h2>🏙 Gothenburg 3D</h2>
  <div class="sub">EUBUCCO v0.2 · EPC building use</div>
  <div class="stat"><span class="lbl">Buildings</span><span class="val">{n_total:,}</span></div>
  <div class="legend-title">Building use (from EPC)</div>
  <div class="legend">{type_legend_html}</div>
</div>

<!-- Address search -->
<div id="search-box">
  <div id="search-row">
    <input id="search-input" type="text" placeholder="Search address in Gothenburg…" autocomplete="off"/>
    <button id="search-btn">🔍 Search</button>
  </div>
  <div id="search-results"></div>
  <div id="search-status"></div>
</div>

<!-- Energy-class panel (shown when colorMode === 'eclass') -->
<div id="eclass-panel" class="ppg-panel">
  <h2>⚡ EPC Energy Class</h2>
  <div class="sub">{n_eclass_total:,} buildings with EPC · click to filter</div>
  <div id="eclass-legend">{eclass_legend_html}</div>
  <div class="no-epc-note">{n_total - n_eclass_total:,} buildings have no EPC on record (shown dimmed)</div>
  <button id="eclass-clear">✕ Clear filter</button>
</div>

<!-- Year-mode legend panel (shown when colorMode === 'year') -->
<div id="year-panel" class="ppg-panel">
  <h2>🗓 Construction Era</h2>
  <div class="sub">TABULA periods · click to highlight</div>
  <div id="period-legend"></div>
  <button id="year-clear">✕ Clear highlight</button>
  <button id="btn-energy-compare">⚡ Compare energy use</button>
  <div id="perf-legend">
    <div class="perf-title">Energy use within era</div>
    <div class="perf-bar-wrap">
      <canvas id="perf-gradient-bar" height="14" style="border-radius:4px;display:block;width:100%"></canvas>
    </div>
    <div class="perf-bar-labels"><span>Best (low kWh)</span><span>Worst (high kWh)</span></div>
  </div>
  <!-- Energy extreme cards (shown when a period is highlighted) -->
  <div id="energy-cards">
    <div class="ec-header">⚡ Energy Extremes</div>
    <div class="ec-section">
      <div class="ec-section-title">🟢 Most efficient</div>
      <div id="ec-best-list"></div>
    </div>
    <div class="ec-section">
      <div class="ec-section-title">🔴 Least efficient</div>
      <div id="ec-worst-list"></div>
    </div>
  </div>
</div>

<div id="tooltip"></div>
<div id="hint">Scroll to zoom · Drag to pan · Right-drag or Ctrl+drag to tilt/rotate · Hover buildings for details</div>
<div id="controls">
  <button class="btn" id="btn-reset">⌂ Reset</button>
  <button class="btn" id="btn-toggle">⇅ Flat / 3D</button>
  <button class="btn" id="btn-eclass-mode">⚡ Energy class</button>
  <button class="btn" id="btn-year-mode">🗓 Year era</button>
  <button class="btn" id="btn-epc-layer">🏠 EPC footprints</button>
  <button class="btn" id="btn-globe">🌍 Globe</button>
</div>
<div id="ppg-brand">PPG <span>· Chalmers / Boverket</span></div>

<script>
const {{ Deck, MapView, PolygonLayer, TileLayer, BitmapLayer, ScatterplotLayer, FlyToInterpolator }} = deck;

const DATA = {data_json};
const EPC_DATA = {epc_json};
const PERIOD_CARDS = {period_cards_js};

let showEpc   = false;
let markerData = [];   // search result pin
let currentViewState = {{
  longitude: {cx:.6f}, latitude: {cy:.6f},
  zoom: 13, pitch: 50, bearing: -15,
}};

let is3D      = true;
let colorMode = 'use';       // 'use' | 'year'
let highlightPeriod = null;  // null = show all

// ---- TABULA period colour palette ----------------------------------------
const PERIOD_COLORS = {{
  '...1960':   [220,  60,  50, 220],
  '1961-1975': [235, 130,  40, 220],
  '1976-1985': [235, 200,  40, 220],
  '1986-1995': [ 90, 200,  60, 220],
  '1996-2005': [ 40, 195, 170, 220],
  'post-2005': [ 60, 140, 235, 220],
}};
const PERIOD_LABELS = {{
  '...1960':   'Pre-1960',
  '1961-1975': '1961 – 1975',
  '1976-1985': '1976 – 1985',
  '1986-1995': '1986 – 1995',
  '1996-2005': '1996 – 2005',
  'post-2005': 'Post-2005',
}};
const PERIOD_ORDER = ['...1960','1961-1975','1976-1985','1986-1995','1996-2005','post-2005'];

let energyCompare = false;
let highlightEclass = null;  // null = all, or 'A'..'G'

// ---- EPC energy-class colour map (mirrors Python) -------------------------
const ECLASS_COLORS_JS = {{
  'A': [ 22, 163,  74, 230],
  'B': [ 74, 222, 128, 220],
  'C': [190, 242,  60, 210],
  'D': [250, 204,  21, 215],
  'E': [251, 146,  60, 220],
  'F': [239,  68,  68, 225],
  'G': [153,  27,  27, 230],
}};

// ---- Per-period energy stats for legend gradient -------------------------
const periodEnergyStats = {{}};
function computePeriodStats() {{
  PERIOD_ORDER.forEach(p => {{
    const vals = DATA
      .filter(d => d.tabula_period === p && d.perf_pct !== null && d.perf_pct !== undefined)
      .map(d => d.energy);
    if (!vals.length) return;
    vals.sort((a,b) => a-b);
    periodEnergyStats[p] = {{
      min: Math.round(vals[0]),
      max: Math.round(vals[vals.length-1]),
      p10: Math.round(vals[Math.floor(vals.length*0.10)] || vals[0]),
      p90: Math.round(vals[Math.floor(vals.length*0.90)] || vals[vals.length-1]),
      n:   vals.length,
    }};
  }});
}}
computePeriodStats();

// Shade a period base color by performance (0=best→bright, 1=worst→dark)
function perfColor(baseCol, pct) {{
  // pct=0 → very bright (best); pct=1 → very dark (worst)
  // Best: lerp base toward [255,255,255] by 40%
  // Worst: lerp base toward [20,20,20] by 60%
  const [r, g, b] = baseCol;
  let fr, fg, fb;
  if (pct <= 0.5) {{
    // best half: brighten
    const t = (0.5 - pct) * 2 * 0.55;  // 0 at mid, 0.55 at best
    fr = Math.round(r + (255 - r) * t);
    fg = Math.round(g + (255 - g) * t);
    fb = Math.round(b + (255 - b) * t);
  }} else {{
    // worst half: darken
    const t = (pct - 0.5) * 2 * 0.72;  // 0 at mid, 0.72 at worst
    fr = Math.round(r * (1 - t));
    fg = Math.round(g * (1 - t));
    fb = Math.round(b * (1 - t));
  }}
  return [fr, fg, fb, 230];
}}

// Draw gradient bar for the active period (or default first period)
function drawGradientBar(period) {{
  const canvas = document.getElementById('perf-gradient-bar');
  if (!canvas) return;
  canvas.width = canvas.offsetWidth || 180;
  const ctx = canvas.getContext('2d');
  const col = PERIOD_COLORS[period] || [180,180,180,200];
  const grad = ctx.createLinearGradient(0, 0, canvas.width, 0);
  for (let i = 0; i <= 10; i++) {{
    const t = i / 10;
    const [r,g,b] = perfColor(col, t);
    grad.addColorStop(t, `rgb(${{r}},${{g}},${{b}})`);
  }}
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}}

// Pre-count buildings per period for the legend
const periodCounts = {{}};
DATA.forEach(d => {{
  const p = d.tabula_period || '__unknown__';
  periodCounts[p] = (periodCounts[p] || 0) + 1;
}});

// Build year-mode legend items
function buildPeriodLegend() {{
  const container = document.getElementById('period-legend');
  container.innerHTML = '';
  PERIOD_ORDER.concat(['__unknown__']).forEach(p => {{
    const cnt = periodCounts[p] || 0;
    if (!cnt) return;
    const col = PERIOD_COLORS[p] || [100,100,110,200];
    const lbl = PERIOD_LABELS[p] || 'Year unknown';
    const div = document.createElement('div');
    div.className = 'period-item' + (highlightPeriod === p ? ' active' : '');
    div.dataset.period = p;
    div.innerHTML = `
      <div class="period-swatch" style="background:rgb(${{col[0]}},${{col[1]}},${{col[2]}})"></div>
      <span class="period-label">${{lbl}}</span>
      <span class="period-count">${{cnt.toLocaleString()}}</span>`;
    div.addEventListener('click', () => {{
      highlightPeriod = (highlightPeriod === p) ? null : p;
      buildPeriodLegend();
      buildEnergyCards(highlightPeriod);
      deckgl.setProps({{ layers: getLayers() }});
    }});
    container.appendChild(div);
  }});
}}

// ---------------------------------------------------------------------------
// Optional CARTO raster basemap via deck.gl TileLayer — works over HTTP/HTTPS,
// silently absent when offline / file://. Buildings always render regardless.
// ---------------------------------------------------------------------------
function buildTileLayer() {{
  return new TileLayer({{
    id: 'basemap',
    data: [
      'https://a.basemaps.cartocdn.com/dark_all/{{z}}/{{x}}/{{y}}@2x.png',
      'https://b.basemaps.cartocdn.com/dark_all/{{z}}/{{x}}/{{y}}@2x.png',
      'https://c.basemaps.cartocdn.com/dark_all/{{z}}/{{x}}/{{y}}@2x.png',
    ],
    tileSize: 256,
    renderSubLayers: props => {{
      const {{ data, tile }} = props;
      if (!data) return null;
      const {{ west, south, east, north }} = tile.bbox;
      return new BitmapLayer(props, {{
        data: null, image: data,
        bounds: [west, south, east, north],
      }});
    }},
  }});
}}

function buildMarkerLayer() {{
  if (!markerData.length) return null;
  return new ScatterplotLayer({{
    id: 'search-marker',
    data: markerData,
    getPosition: d => d.position,
    getRadius: 10,
    getFillColor: [167, 139, 250, 220],
    getLineColor: [255, 255, 255, 255],
    lineWidthMinPixels: 2,
    stroked: true,
    radiusUnits: 'pixels',
    pickable: false,
  }});
}}

// ---------------------------------------------------------------------------
// Building colour function
// ---------------------------------------------------------------------------
function getBuildingColor(d) {{

  // ---- ENERGY CLASS mode: color all EPC buildings by A-G rating ----
  if (colorMode === 'eclass') {{
    if (!d.eclass_color) {{
      // No EPC data at all: very dim
      return [60, 60, 70, 40];
    }}
    const col = d.eclass_color;
    if (highlightEclass !== null) {{
      return (d.eclass === highlightEclass) ? col : [col[0], col[1], col[2], 30];
    }}
    return col;
  }}

  // ---- YEAR mode ----
  if (colorMode === 'year') {{
    const baseCol = PERIOD_COLORS[d.tabula_period] || null;

    // No period data: dim EPC buildings slightly, hide non-EPC buildings
    if (!baseCol) {{
      return d.has_epc ? [120, 120, 130, 60] : [40, 40, 45, 20];
    }}

    if (energyCompare) {{
      if (d.perf_pct === null || d.perf_pct === undefined) {{
        return [60, 60, 65, 60];
      }}
      const col = perfColor(baseCol, d.perf_pct);
      if (highlightPeriod !== null && (d.tabula_period || '__unknown__') !== highlightPeriod) {{
        return [col[0], col[1], col[2], 30];
      }}
      return col;
    }}

    if (highlightPeriod !== null) {{
      const match = (d.tabula_period || '__unknown__') === highlightPeriod;
      return match ? baseCol : [baseCol[0], baseCol[1], baseCol[2], 35];
    }}
    return baseCol;
  }}

  // ---- USE mode (default) ----
  if (highlightPeriod !== null) {{
    const match = (d.tabula_period || '__unknown__') === highlightPeriod;
    return match ? d.color : [d.color[0], d.color[1], d.color[2], 35];
  }}
  return d.color;
}}

function buildLayer() {{
  return new PolygonLayer({{
    id: 'buildings',
    data: DATA,
    pickable: true,
    extruded: is3D,
    wireframe: false,
    getPolygon:   d => d.coordinates[0],
    getElevation: d => d.height,
    elevationScale: is3D ? 1 : 0,
    getFillColor: d => getBuildingColor(d),
    getLineColor: [255, 255, 255, 20],
    lineWidthMinPixels: 0,
    material: {{
      ambient: 0.35,
      diffuse: 0.6,
      shininess: 32,
      specularColor: [60, 64, 70],
    }},
    transitions: {{ elevationScale: {{ duration: 700, type: 'spring' }} }},
    updateTriggers: {{ elevationScale: is3D, getFillColor: [colorMode, highlightPeriod] }},
    onHover: (info) => showTooltip(info),
  }});
}}

// EPC footprint colour map (same as ECLASS_COLORS_JS + grey for unknown)
const EPC_ECLASS_COLORS = {{
  'A': [22,  163,  74, 180],
  'B': [74,  222, 128, 170],
  'C': [190, 242,  60, 165],
  'D': [250, 204,  21, 170],
  'E': [251, 146,  60, 175],
  'F': [239,  68,  68, 180],
  'G': [153,  27,  27, 185],
}};

function buildEpcLayer() {{
  return new PolygonLayer({{
    id: 'epc-footprints',
    data: EPC_DATA,
    visible: showEpc,
    pickable: true,
    extruded: false,
    getPolygon: d => d.coordinates,
    getFillColor: d => EPC_ECLASS_COLORS[d.eclass] || [120, 120, 140, 120],
    getLineColor: [255, 255, 255, 60],
    lineWidthMinPixels: 0.5,
    onHover: (info) => {{
      if (!showEpc) return;
      if (info.object) {{
        const d = info.object;
        const vw = window.innerWidth, vh = window.innerHeight;
        let tx = info.x + 16, ty = info.y + 16;
        if (tx + 260 > vw) tx = info.x - 260;
        if (ty + 120 > vh) ty = info.y - 120;
        tooltip.style.left = tx + 'px';
        tooltip.style.top  = ty + 'px';
        tooltip.style.display = 'block';
        let epcHtml = '<div class="tt-header">EPC Footprint</div>';
        if (d.andamal) epcHtml += '<div class="tt-row"><span class="tt-lbl">Use</span><span class="tt-val">' + d.andamal + '</span></div>';
        if (d.eclass)  epcHtml += '<div class="tt-row"><span class="tt-lbl">Energy class</span><span class="tt-val">' + d.eclass + '</span></div>';
        if (d.address) epcHtml += '<div class="tt-row"><span class="tt-lbl">Address</span><span class="tt-val">' + d.address + '</span></div>';
        tooltip.innerHTML = epcHtml;
      }} else {{
        tooltip.style.display = 'none';
      }}
    }},
  }});
}}

function getLayers() {{
  const layers = [ buildTileLayer(), buildLayer() ];
  if (showEpc) layers.push(buildEpcLayer());
  const mk = buildMarkerLayer();
  if (mk) layers.push(mk);
  return layers.filter(Boolean);
}}

// ---------------------------------------------------------------------------
// deck.gl Deck — standalone renderer, works from file:// and any HTTP origin
// ---------------------------------------------------------------------------
const deckgl = new Deck({{
  canvas: document.getElementById('deck-canvas'),
  views: new MapView({{ repeat: true }}),
  controller: true,
  initialViewState: currentViewState,
  onViewStateChange: ({{ viewState }}) => {{ currentViewState = viewState; }},
  layers: getLayers(),
  _onMetrics: null,
}});

// ---------------------------------------------------------------------------
// Tooltip
// ---------------------------------------------------------------------------
const tooltip = document.getElementById('tooltip');

const USE_LABELS_JS = {{
  bostad_enfamilj:   'Single-family home',
  bostad_flerfamilj: 'Multi-family residential',
  komplement:        'Outbuilding / garage',
  verksamhet:        'Commercial / office',
  industri:          'Industrial',
  samhalle:          'Public / civic',
  ovrigt:            'Unknown / other',
}};

function row(label, value) {{
  if (value === null || value === undefined) return '';
  return '<div class="tt-row"><span class="tt-lbl">' + label + '</span><span class="tt-val">' + value + '</span></div>';
}}

function showTooltip(info) {{
  if (info.object) {{
    const d = info.object;
    // Keep tooltip inside viewport
    const vw = window.innerWidth, vh = window.innerHeight;
    let tx = info.x + 16, ty = info.y + 16;
    if (tx + 310 > vw) tx = info.x - 310;
    if (ty + 280 > vh) ty = info.y - 280;
    tooltip.style.left = tx + 'px';
    tooltip.style.top  = ty + 'px';
    tooltip.style.display = 'block';

    const useLabel = USE_LABELS_JS[d.use_cat] || d.use_cat || 'Unknown';
    const subStr   = d.subtype ? d.subtype.replace(/_/g,' ') : null;
    const andamal  = d.andamal ? d.andamal.replace(/;/g, ' · ').replace(/[ ]+/g,' ').trim() : null;

    const eclassColor = {{'A':'#22c55e','B':'#86efac','C':'#bef264','D':'#fde047','E':'#fb923c','F':'#f87171','G':'#dc2626'}};
    const eclassHtml  = d.eclass && eclassColor[d.eclass]
      ? `<span style="background:${{eclassColor[d.eclass]}};color:#000;font-weight:700;padding:1px 6px;border-radius:4px">${{d.eclass}}</span>`
      : d.eclass || null;

    const title = d.address ? d.address : '🏢 Building';
    const periodLabel = d.tabula_period ? (PERIOD_LABELS[d.tabula_period] || d.tabula_period) : null;
    const periodCol   = d.tabula_period ? PERIOD_COLORS[d.tabula_period] : null;
    const periodBadge = periodLabel && periodCol
      ? `<span style="background:rgb(${{periodCol[0]}},${{periodCol[1]}},${{periodCol[2]}});color:#000;font-weight:700;padding:1px 7px;border-radius:4px;font-size:10px">${{periodLabel}}</span>`
      : (periodLabel || null);
    tooltip.innerHTML =
      `<div class="tt-title">${{title}}</div>` +
      row('Building use', useLabel) +
      (andamal ? row('EPC category', andamal) : '') +
      `<hr class="tt-divider"/>` +
      row('Year built', d.year) +
      row('TABULA period', periodBadge) +
      row('Storeys', d.floors ? d.floors.toFixed(0) : null) +
      row('Heated area (Atemp)', d.area ? d.area.toLocaleString() + ' m²' : null) +
      row('Energy use', d.energy ? d.energy.toFixed(0) + ' kWh/m²·yr' : null) +
      row('Energy class', eclassHtml) +
      `<hr class="tt-divider"/>` +
      (d.tabula_u_wall  ? row('U wall',   d.tabula_u_wall  + ' W/m²K') : '') +
      (d.tabula_u_roof  ? row('U roof',   d.tabula_u_roof  + ' W/m²K') : '') +
      (d.tabula_u_win   ? row('U window', d.tabula_u_win   + ' W/m²K') : '') +
      (d.tabula_heat_z3 ? row('TABULA heat demand (Z3)', d.tabula_heat_z3 + ' kWh/m²·yr') : '') +
      (d.tabula_wall    ? row('Wall construction', d.tabula_wall) : '') +
      (d.tabula_roof    ? row('Roof construction', d.tabula_roof) : '') +
      (energyCompare && d.perf_pct !== null && d.perf_pct !== undefined
        ? (() => {{
            const pct = d.perf_pct;
            const label = pct < 0.2 ? '🟢 Top 20% (best for its era)'
                        : pct < 0.4 ? '🟡 Above average'
                        : pct < 0.6 ? '🟠 Average'
                        : pct < 0.8 ? '🔴 Below average'
                                    : '🔴 Bottom 20% (worst for its era)';
            return `<hr class="tt-divider"/>` +
              row('Era performance', label) +
              row('Percentile (within era)', `top ${{Math.round((1-pct)*100)}}%`);
          }})()
        : '') +
      `<hr class="tt-divider"/>` +
      row('Height', d.height.toFixed(1) + ' m');
  }} else {{
    tooltip.style.display = 'none';
  }}
}}

// ---------------------------------------------------------------------------
// Energy-class legend builder
// ---------------------------------------------------------------------------
function buildEclassLegend() {{
  const container = document.getElementById('eclass-legend');
  if (!container) return;
  const items = container.querySelectorAll('.eclass-item');
  items.forEach(item => {{
    const cls = item.dataset.eclass;
    item.classList.toggle('active', highlightEclass === cls);
  }});
}}

document.getElementById('eclass-legend').addEventListener('click', (e) => {{
  const item = e.target.closest('.eclass-item');
  if (!item) return;
  const cls = item.dataset.eclass;
  highlightEclass = (highlightEclass === cls) ? null : cls;
  buildEclassLegend();
  deckgl.setProps({{ layers: getLayers() }});
}});

// ---------------------------------------------------------------------------
// Energy extreme cards (best / worst buildings per construction era)
// ---------------------------------------------------------------------------
function buildEnergyCards(period) {{
  const cardsEl = document.getElementById('energy-cards');
  if (!period || !PERIOD_CARDS[period]) {{
    cardsEl.style.display = 'none';
    return;
  }}
  cardsEl.style.display = 'block';
  const ECLASS_BG = {{
    A:'#16a34a', B:'#4ade80', C:'#bef264',
    D:'#fde047', E:'#fb923c', F:'#f87171', G:'#dc2626'
  }};
  ['best','worst'].forEach(type => {{
    const list = document.getElementById('ec-' + type + '-list');
    list.innerHTML = '';
    (PERIOD_CARDS[period][type] || []).forEach(c => {{
      const badge = c.eclass
        ? `<span class="ec-badge" style="background:${{ECLASS_BG[c.eclass]||'#475569'}};color:${{['D','E'].includes(c.eclass)?'#000':'#fff'}}">${{c.eclass}}</span>`
        : '';
      list.innerHTML += `<div class="ec-card ${{type}}">
        <span class="ec-addr" title="${{c.addr}}">${{c.addr}}</span>
        ${{badge}}
        <span class="ec-val">${{Math.round(c.energy)}} kWh/m²</span>
      </div>`;
    }});
  }});
}}

// ---------------------------------------------------------------------------
// Unified mode switcher
// ---------------------------------------------------------------------------
function switchMode(newMode) {{
  colorMode = newMode;
  highlightPeriod = null;
  highlightEclass = null;
  buildEnergyCards(null);

  const usePanel   = document.getElementById('panel');
  const yearPanel  = document.getElementById('year-panel');
  const eclassPanel= document.getElementById('eclass-panel');

  const btnYear  = document.getElementById('btn-year-mode');
  const btnEclass= document.getElementById('btn-eclass-mode');

  // Reset button styles
  [btnYear, btnEclass].forEach(b => {{ b.style.borderColor = ''; b.style.color = ''; }});

  if (newMode === 'year') {{
    usePanel.style.display   = 'none';
    yearPanel.style.display  = 'block';
    eclassPanel.style.display= 'none';
    btnYear.textContent      = '🏷 Use mode';
    btnYear.style.borderColor= 'rgba(150,215,76,0.5)';
    btnYear.style.color      = '#96d74c';
    buildPeriodLegend();
  }} else if (newMode === 'eclass') {{
    usePanel.style.display   = 'none';
    yearPanel.style.display  = 'none';
    eclassPanel.style.display= 'block';
    btnEclass.textContent    = '🏷 Use mode';
    btnEclass.style.borderColor= 'rgba(150,215,76,0.5)';
    btnEclass.style.color    = '#96d74c';
    buildEclassLegend();
  }} else {{
    usePanel.style.display   = 'block';
    yearPanel.style.display  = 'none';
    eclassPanel.style.display= 'none';
    btnYear.textContent      = '🗓 Year era';
    btnEclass.textContent    = '⚡ Energy class';
  }}
  deckgl.setProps({{ layers: getLayers() }});
}}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------
document.getElementById('btn-reset').addEventListener('click', () => {{
  deckgl.setProps({{ initialViewState: {{
    longitude: {cx:.6f}, latitude: {cy:.6f},
    zoom: 13, pitch: is3D ? 50 : 0, bearing: -15,
    transitionDuration: 1200,
    transitionInterpolator: new FlyToInterpolator({{ speed: 1.5 }}),
  }} }});
}});

document.getElementById('btn-toggle').addEventListener('click', () => {{
  is3D = !is3D;
  deckgl.setProps({{
    layers: getLayers(),
    initialViewState: {{ ...currentViewState, pitch: is3D ? 50 : 0, transitionDuration: 700 }},
  }});
}});

document.getElementById('btn-epc-layer').addEventListener('click', () => {{
  showEpc = !showEpc;
  document.getElementById('btn-epc-layer').classList.toggle('active', showEpc);
  deckgl.setProps({{ layers: getLayers() }});
}});

// ---------------------------------------------------------------------------
// Cesium Globe
// ---------------------------------------------------------------------------
let cesiumViewer = null;
const CITIES = [
  {{ name: 'Gothenburg', lon: {cx:.6f}, lat: {cy:.6f}, active: true }},
];

function initCesium() {{
  if (cesiumViewer) return;  // already initialised
  // Lazy-load Cesium from CDN
  const cssLink = document.createElement('link');
  cssLink.rel = 'stylesheet';
  cssLink.href = 'https://cesium.com/downloads/cesiumjs/releases/1.117/Build/Cesium/Widgets/widgets.css';
  document.head.appendChild(cssLink);

  const script = document.createElement('script');
  script.src = 'https://cesium.com/downloads/cesiumjs/releases/1.117/Build/Cesium/Cesium.js';
  script.onload = () => {{
    Cesium.Ion.defaultAccessToken = undefined;  // no token — uses free offline ellipsoid
    cesiumViewer = new Cesium.Viewer('cesium-container', {{
      timeline: false, animation: false, baseLayerPicker: false,
      geocoder: false, homeButton: false, sceneModePicker: false,
      navigationHelpButton: false, fullscreenButton: false,
      imageryProvider: new Cesium.TileMapServiceImageryProvider({{
        url: Cesium.buildModuleUrl('Assets/Textures/NaturalEarthII'),
      }}),
    }});
    cesiumViewer.scene.globe.enableLighting = true;
    cesiumViewer.scene.skyBox.show = true;

    // Add city pins
    CITIES.forEach(city => {{
      const entity = cesiumViewer.entities.add({{
        name: city.name,
        position: Cesium.Cartesian3.fromDegrees(city.lon, city.lat, 0),
        billboard: {{
          image: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
            '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="40" viewBox="0 0 32 40">'+
            '<ellipse cx="16" cy="38" rx="6" ry="2.5" fill="rgba(0,0,0,0.35)"/>'+
            '<path d="M16 0 C7.163 0 0 7.163 0 16 C0 28 16 40 16 40 C16 40 32 28 32 16 C32 7.163 24.837 0 16 0Z" fill="'+(city.active ? '#721CB8' : '#64748b')+'"/>'+
            '<circle cx="16" cy="16" r="7" fill="white" opacity="0.9"/>'+
            '</svg>'
          ),
          width: 32, height: 40, verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        }},
        label: {{
          text: city.name,
          font: '13px Inter, sans-serif',
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: Cesium.VerticalOrigin.TOP,
          pixelOffset: new Cesium.Cartesian2(0, 4),
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        }},
      }});
    }});

    // Fly to first city
    cesiumViewer.camera.flyTo({{
      destination: Cesium.Cartesian3.fromDegrees({cx:.6f}, {cy:.6f}, 800000),
      duration: 2,
    }});

    // Click on a pin → close globe, fly to that city in deck.gl
    cesiumViewer.screenSpaceEventHandler.setInputAction(movement => {{
      const picked = cesiumViewer.scene.pick(movement.position);
      if (Cesium.defined(picked) && picked.id) {{
        const city = picked.id.properties;
        // Currently we only have Gothenburg — extend this when more cities added
        document.getElementById('cesium-globe').style.display = 'none';
      }}
    }}, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  }};
  document.head.appendChild(script);
}}

document.getElementById('btn-globe').addEventListener('click', () => {{
  const globe = document.getElementById('cesium-globe');
  globe.style.display = 'flex';
  initCesium();
}});
document.getElementById('cesium-close').addEventListener('click', () => {{
  document.getElementById('cesium-globe').style.display = 'none';
}});

document.getElementById('btn-year-mode').addEventListener('click', () => {{
  switchMode(colorMode === 'year' ? 'use' : 'year');
}});

document.getElementById('btn-eclass-mode').addEventListener('click', () => {{
  switchMode(colorMode === 'eclass' ? 'use' : 'eclass');
}});

document.getElementById('year-clear').addEventListener('click', () => {{
  highlightPeriod = null;
  buildPeriodLegend();
  buildEnergyCards(null);
  deckgl.setProps({{ layers: getLayers() }});
}});

document.getElementById('eclass-clear').addEventListener('click', () => {{
  highlightEclass = null;
  buildEclassLegend();
  deckgl.setProps({{ layers: getLayers() }});
}});

document.getElementById('btn-energy-compare').addEventListener('click', () => {{
  energyCompare = !energyCompare;
  const btn = document.getElementById('btn-energy-compare');
  const perfLegend = document.getElementById('perf-legend');
  if (energyCompare) {{
    btn.classList.add('active');
    btn.textContent = '⚡ Energy compare ON';
    perfLegend.style.display = 'block';
    // Draw gradient for the highlighted period or first with data
    const activePeriod = highlightPeriod || PERIOD_ORDER.find(p => periodEnergyStats[p]) || PERIOD_ORDER[0];
    setTimeout(() => drawGradientBar(activePeriod), 50);
  }} else {{
    btn.classList.remove('active');
    btn.textContent = '⚡ Compare energy use';
    perfLegend.style.display = 'none';
  }}
  deckgl.setProps({{ layers: getLayers() }});
}});

// Redraw gradient bar when period highlight changes (only in energy compare mode)
// Patch buildPeriodLegend in-place so existing click handlers pick up the change
const _origBuildPeriodLegend = buildPeriodLegend;
buildPeriodLegend = function buildPeriodLegendWithGradient() {{
  _origBuildPeriodLegend();
  if (energyCompare) {{
    const activePeriod = highlightPeriod || PERIOD_ORDER.find(p => periodEnergyStats[p]) || PERIOD_ORDER[0];
    setTimeout(() => drawGradientBar(activePeriod), 50);
  }}
}};

// ---------------------------------------------------------------------------
// Address search via Nominatim (OpenStreetMap) – no API key needed
// ---------------------------------------------------------------------------
const searchInput   = document.getElementById('search-input');
const searchBtn     = document.getElementById('search-btn');
const searchResults = document.getElementById('search-results');
const searchStatus  = document.getElementById('search-status');

function setStatus(msg, isError) {{
  searchStatus.style.display = msg ? 'block' : 'none';
  searchStatus.style.color = isError ? '#f87171' : '#94a3b8';
  searchStatus.textContent  = msg;
}}

async function geocodeAddress() {{
  const q = searchInput.value.trim();
  if (!q) return;

  searchBtn.classList.add('loading');
  searchBtn.textContent = '…';
  searchResults.style.display = 'none';
  setStatus('');

  try {{
    // Bias search to Gothenburg region using viewbox
    const url = `https://nominatim.openstreetmap.org/search?` +
      `q=${{encodeURIComponent(q + ', Gothenburg, Sweden')}}` +
      `&format=jsonv2&limit=5&addressdetails=1` +
      `&viewbox=11.7,57.5,12.3,57.9&bounded=0`;

    const resp = await fetch(url, {{
      headers: {{ 'Accept-Language': 'en', 'User-Agent': 'GothenburgBuildingViewer/1.0' }}
    }});
    const data = await resp.json();

    if (!data.length) {{
      setStatus('No results found. Try a street name or postcode.', true);
      return;
    }}

    // Render result list
    searchResults.innerHTML = data.map((r, i) => {{
      const name = r.name || r.display_name.split(',')[0];
      const addr = r.display_name.split(',').slice(1, 4).join(',').trim();
      return '<div class="result-item" data-idx="' + i + '">' +
        '<div class="result-name">' + name + '</div>' +
        '<div class="result-addr">' + addr + '</div>' +
        '</div>';
    }}).join('');
    searchResults.style.display = 'block';
    setStatus(`${{data.length}} result${{data.length > 1 ? 's' : ''}} found`);

    // Store results for click handler
    searchResults._data = data;

  }} catch(e) {{
    setStatus('Search failed – check your internet connection.', true);
  }} finally {{
    searchBtn.classList.remove('loading');
    searchBtn.textContent = '🔍 Search';
  }}
}}

// Fly to a result and drop a marker
function flyToResult(r) {{
  const lng = parseFloat(r.lon);
  const lat = parseFloat(r.lat);

  // Update marker ScatterplotLayer
  markerData = [{{ position: [lng, lat] }}];
  const zoomMap = {{
    'house': 18, 'building': 18, 'road': 16, 'residential': 16,
    'suburb': 14, 'neighbourhood': 14, 'postcode': 15,
    'city': 13, 'town': 13,
  }};
  const zoom = zoomMap[r.type] || zoomMap[r.addresstype] || 17;

  deckgl.setProps({{
    layers: getLayers(),
    initialViewState: {{
      longitude: lng, latitude: lat, zoom,
      pitch: is3D ? 50 : 0,
      bearing: currentViewState.bearing,
      transitionDuration: 1400,
      transitionInterpolator: new FlyToInterpolator({{ speed: 1.5 }}),
    }},
  }});

  searchResults.style.display = 'none';
  setStatus('');
}}

// Wire up events
searchBtn.addEventListener('click', geocodeAddress);
searchInput.addEventListener('keydown', e => {{ if (e.key === 'Enter') geocodeAddress(); }});

searchResults.addEventListener('click', e => {{
  const item = e.target.closest('.result-item');
  if (!item) return;
  const idx  = parseInt(item.dataset.idx);
  flyToResult(searchResults._data[idx]);
}});

// Close results on outside click
document.addEventListener('click', e => {{
  if (!document.getElementById('search-box').contains(e.target)) {{
    searchResults.style.display = 'none';
  }}
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
