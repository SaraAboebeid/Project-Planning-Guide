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
n_exact = len(joined_exact)
n_near  = len(joined_nearest)
print(f"  Matched {matched:,} of {len(gdf):,} buildings to EPC use ({matched/len(gdf)*100:.1f}%)")
print(f"  (exact 'within': {n_exact:,} EPC pts | nearest ≤{MAX_DIST_M}m: {n_near:,} EPC pts)")
print(f"  Top andamal1 values:")
print(joined["andamal1"].value_counts().head(10).to_string())

# Assign use category (with unicode-normalised matching)
gdf["use_cat"] = gdf["andamal1_epc"].apply(andamal_to_use)

# ---------------------------------------------------------------------------
# Simplify geometries to reduce HTML file size (AFTER EPC join)
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
        "andamal":     str(andamal) if andamal and andamal == andamal else None,
        "use_cat":     use,
        "address":     display_addr,
    })

data_json = json.dumps(records)

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
# Generate HTML
# ---------------------------------------------------------------------------
print("  Writing HTML …")

html = f"""<!DOCTYPE html>
<html>
<head>
  <title>Gothenburg 3D Buildings – EUBUCCO v0.2</title>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <script src="https://unpkg.com/deck.gl@8.9.35/dist.min.js"></script>
  <script src="https://unpkg.com/maplibre-gl@3.6.2/dist/maplibre-gl.js"></script>
  <link href="https://unpkg.com/maplibre-gl@3.6.2/dist/maplibre-gl.css" rel="stylesheet"/>
  <style>
    * {{ margin:0; padding:0; box-sizing:border-box; }}
    body {{ font-family: 'Segoe UI', sans-serif; background:#0f1117; color:#e2e8f0; }}
    #map {{ width:100vw; height:100vh; }}

    #panel {{
      position:absolute; top:16px; left:16px; z-index:10;
      background:rgba(15,17,23,0.88); backdrop-filter:blur(8px);
      border:1px solid rgba(255,255,255,0.1); border-radius:12px;
      padding:16px 18px; width:220px;
      box-shadow:0 8px 32px rgba(0,0,0,0.5);
      pointer-events:auto;
    }}
    #panel h2 {{ font-size:13px; font-weight:700; color:#a78bfa; margin-bottom:4px; letter-spacing:.5px; text-transform:uppercase; }}
    #panel .sub {{ font-size:11px; color:#94a3b8; margin-bottom:12px; }}
    .stat {{ display:flex; justify-content:space-between; padding:5px 0; border-bottom:1px solid rgba(255,255,255,0.06); }}
    .stat .lbl {{ font-size:11px; color:#94a3b8; }}
    .stat .val {{ font-size:12px; font-weight:600; color:#f1f5f9; }}
    .legend-title {{ font-size:11px; color:#94a3b8; margin:12px 0 6px; text-transform:uppercase; letter-spacing:.4px; }}
    .legend {{ font-size:11px; color:#cbd5e1; }}
    #tooltip {{
      position:absolute; pointer-events:none; z-index:20;
      background:rgba(15,17,23,0.95); border:1px solid rgba(255,255,255,0.12);
      border-radius:10px; padding:12px 16px; font-size:12px; line-height:1.6;
      min-width:220px; max-width:300px; display:none;
      box-shadow: 0 6px 24px rgba(0,0,0,0.5);
    }}
    .tt-title {{ font-size:13px; font-weight:700; color:#a78bfa; margin-bottom:8px; border-bottom:1px solid rgba(255,255,255,0.08); padding-bottom:6px; }}
    .tt-row {{ display:flex; justify-content:space-between; gap:12px; padding:2px 0; }}
    .tt-lbl {{ color:#64748b; font-size:11px; }}
    .tt-val {{ color:#e2e8f0; font-size:11px; font-weight:600; text-align:right; }}
    .tt-divider {{ border:none; border-top:1px solid rgba(255,255,255,0.07); margin:6px 0; }}
    #controls {{
      position:absolute; bottom:24px; left:50%; transform:translateX(-50%);
      z-index:10; display:flex; gap:10px; pointer-events:auto;
    }}
    .btn {{
      background:rgba(167,139,250,0.15); border:1px solid rgba(167,139,250,0.4);
      color:#a78bfa; padding:7px 16px; border-radius:6px; cursor:pointer; font-size:12px;
      transition:background 0.2s; backdrop-filter:blur(6px);
    }}
    .btn:hover {{ background:rgba(167,139,250,0.3); }}
    #hint {{
      position:absolute; bottom:70px; left:50%; transform:translateX(-50%);
      z-index:10; font-size:11px; color:#64748b; text-align:center;
      white-space:nowrap;
    }}

    /* ---- Search bar ---- */
    #search-box {{
      position:absolute; top:16px; right:16px; z-index:10;
      display:flex; flex-direction:column; gap:6px; width:300px;
      pointer-events:auto;
    }}
    #search-row {{
      display:flex; gap:6px;
    }}
    #search-input {{
      flex:1; background:rgba(15,17,23,0.88); backdrop-filter:blur(8px);
      border:1px solid rgba(255,255,255,0.15); border-radius:8px;
      padding:8px 12px; color:#e2e8f0; font-size:13px;
      outline:none; transition:border-color 0.2s;
    }}
    #search-input::placeholder {{ color:#64748b; }}
    #search-input:focus {{ border-color:rgba(167,139,250,0.6); }}
    #search-btn {{
      background:rgba(167,139,250,0.2); border:1px solid rgba(167,139,250,0.4);
      border-radius:8px; color:#a78bfa; padding:8px 14px; cursor:pointer;
      font-size:14px; transition:background 0.2s; backdrop-filter:blur(8px);
      white-space:nowrap;
    }}
    #search-btn:hover {{ background:rgba(167,139,250,0.4); }}
    #search-btn.loading {{ opacity:0.5; pointer-events:none; }}
    #search-results {{
      background:rgba(15,17,23,0.95); backdrop-filter:blur(8px);
      border:1px solid rgba(255,255,255,0.1); border-radius:8px;
      overflow:hidden; display:none;
    }}
    .result-item {{
      padding:9px 12px; cursor:pointer; font-size:12px; color:#cbd5e1;
      border-bottom:1px solid rgba(255,255,255,0.05); transition:background 0.15s;
      line-height:1.4;
    }}
    .result-item:last-child {{ border-bottom:none; }}
    .result-item:hover {{ background:rgba(167,139,250,0.15); color:#e2e8f0; }}
    .result-item .result-name {{ font-weight:600; color:#e2e8f0; }}
    .result-item .result-addr {{ font-size:11px; color:#64748b; margin-top:2px; }}
    #search-status {{
      font-size:11px; color:#64748b; padding:6px 12px;
      background:rgba(15,17,23,0.88); border:1px solid rgba(255,255,255,0.08);
      border-radius:8px; backdrop-filter:blur(8px); display:none;
    }}
  </style>
</head>
<body>
<div id="map"></div>
<div id="panel">
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

<div id="tooltip"></div>
<div id="hint">Scroll to zoom · Drag to pan · Right-drag or Ctrl+drag to tilt/rotate · Hover buildings for details</div>
<div id="controls">
  <button class="btn" id="btn-reset">⌂ Reset view</button>
  <button class="btn" id="btn-toggle">⇅ Toggle flat / 3D</button>
</div>

<script>
const {{ MapboxOverlay, PolygonLayer }} = deck;

const DATA = {data_json};

let is3D = true;

// ---------------------------------------------------------------------------
// MapLibre GL map (handles all pan / zoom / tilt navigation)
// ---------------------------------------------------------------------------
const map = new maplibregl.Map({{
  container: 'map',
  style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
  center:  [{cx:.6f}, {cy:.6f}],
  zoom:    13,
  pitch:   50,
  bearing: -15,
  antialias: true,
}});

// ---------------------------------------------------------------------------
// deck.gl overlay (renders on top of the MapLibre canvas)
// ---------------------------------------------------------------------------
let overlay;

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
    getFillColor: d => d.color,
    getLineColor: [255, 255, 255, 20],
    lineWidthMinPixels: 0,
    material: {{
      ambient: 0.35,
      diffuse: 0.6,
      shininess: 32,
      specularColor: [60, 64, 70],
    }},
    transitions: {{ elevationScale: {{ duration: 700, type: 'spring' }} }},
    updateTriggers: {{ elevationScale: is3D }},
    onHover: (info) => showTooltip(info),
  }});
}}

map.on('load', () => {{
  overlay = new MapboxOverlay({{
    interleaved: false,
    layers: [ buildLayer() ],
  }});
  map.addControl(overlay);
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
  return `<div class="tt-row"><span class="tt-lbl">${{label}}</span><span class="tt-val">${{value}}</span></div>`;
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
    tooltip.innerHTML =
      `<div class="tt-title">${{title}}</div>` +
      row('Building use', useLabel) +
      (andamal ? row('EPC category', andamal) : '') +
      `<hr class="tt-divider"/>` +
      row('Year built', d.year) +
      row('Storeys', d.floors ? d.floors.toFixed(0) : null) +
      row('Heated area (Atemp)', d.area ? d.area.toLocaleString() + ' m²' : null) +
      row('Energy use', d.energy ? d.energy.toFixed(0) + ' kWh/m²·yr' : null) +
      row('Energy class', eclassHtml) +
      `<hr class="tt-divider"/>` +
      row('Height', d.height.toFixed(1) + ' m');
  }} else {{
    tooltip.style.display = 'none';
  }}
}}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------
document.getElementById('btn-reset').addEventListener('click', () => {{
  map.flyTo({{
    center:  [{cx:.6f}, {cy:.6f}],
    zoom:    13,
    pitch:   is3D ? 50 : 0,
    bearing: -15,
    duration: 1200,
  }});
}});

document.getElementById('btn-toggle').addEventListener('click', () => {{
  is3D = !is3D;
  overlay.setProps({{ layers: [ buildLayer() ] }});
  map.easeTo({{ pitch: is3D ? 50 : 0, duration: 700 }});
}});

// ---------------------------------------------------------------------------
// Address search via Nominatim (OpenStreetMap) – no API key needed
// ---------------------------------------------------------------------------
let searchMarker = null;

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
      return `<div class="result-item" data-idx="${{i}}">
        <div class="result-name">${{name}}</div>
        <div class="result-addr">${{addr}}</div>
      </div>`;
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

  // Remove old marker
  if (searchMarker) {{ searchMarker.remove(); searchMarker = null; }}

  // Create a pulsing marker element
  const el = document.createElement('div');
  el.style.cssText = `
    width:18px; height:18px; border-radius:50%;
    background:rgba(167,139,250,0.9);
    border:3px solid white;
    box-shadow:0 0 0 4px rgba(167,139,250,0.3);
    animation:pulse 1.5s infinite;
  `;
  // Add pulse keyframes once
  if (!document.getElementById('pulse-style')) {{
    const s = document.createElement('style');
    s.id = 'pulse-style';
    s.textContent = `@keyframes pulse {{
      0%   {{ box-shadow:0 0 0 0 rgba(167,139,250,0.5); }}
      70%  {{ box-shadow:0 0 0 10px rgba(167,139,250,0); }}
      100% {{ box-shadow:0 0 0 0 rgba(167,139,250,0); }}
    }}`;
    document.head.appendChild(s);
  }}

  searchMarker = new maplibregl.Marker({{ element: el, anchor: 'center' }})
    .setLngLat([lng, lat])
    .setPopup(
      new maplibregl.Popup({{ offset: 16, closeButton: false }})
        .setHTML(`<div style="font-size:12px;color:#1e293b;max-width:200px">
          <b>${{r.name || r.display_name.split(',')[0]}}</b><br/>
          <span style="color:#475569">${{r.display_name.split(',').slice(1,3).join(',').trim()}}</span>
        </div>`)
    )
    .addTo(map);
  searchMarker.togglePopup();

  // Work out zoom based on result type
  const zoomMap = {{
    'house': 18, 'building': 18, 'road': 16, 'residential': 16,
    'suburb': 14, 'neighbourhood': 14, 'postcode': 15,
    'city': 13, 'town': 13,
  }};
  const zoom = zoomMap[r.type] || zoomMap[r.addresstype] || 17;

  map.flyTo({{
    center: [lng, lat],
    zoom,
    pitch: is3D ? 50 : 0,
    bearing: map.getBearing(),
    duration: 1400,
    essential: true,
  }});

  // Close dropdown
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
