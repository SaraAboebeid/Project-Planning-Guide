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

def andamal_to_use(andamal: str) -> str:
    """Map EPC andamal1 string to a colour category key."""
    if not isinstance(andamal, str):
        return "ovrigt"
    a = andamal.lower()
    if "komplement" in a or "ekonomi" in a:
        return "komplement"
    if "flerfamilj" in a or "flerbostad" in a or "hyreshus" in a:
        return "bostad_flerfamilj"
    if "bostad" in a or "smahus" in a or "småhus" in a or "radhus" in a or "kedjehus" in a:
        return "bostad_enfamilj"
    if "verksamhet" in a or "handel" in a or "kontor" in a:
        return "verksamhet"
    if "industri" in a or "tillverkning" in a or "lager" in a:
        return "industri"
    if "samhall" in a or "skola" in a or "vård" in a or "vard" in a or "samfund" in a or "offentlig" in a:
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
# Simplify geometries to reduce file size
# Tolerance ~1m in EPSG:3035 equivalent; simplify BEFORE reprojecting is better,
# but we already reprojected. Use a small degree-unit tolerance (~5-10m).
# ---------------------------------------------------------------------------
print("  Simplifying geometries …")
gdf["geometry"] = gdf["geometry"].simplify(tolerance=0.00005, preserve_topology=True)

# ---------------------------------------------------------------------------
# Join EPC footprints → get building use (andamal1) via spatial join
# ---------------------------------------------------------------------------
import duckdb
from shapely import wkb as shapely_wkb

print("Loading EPC footprints for building use …")
con = duckdb.connect("data/sensitivity/epc_sweden.duckdb", read_only=True)
epc_raw = con.execute("""
    SELECT f.FormularId, f.geom, f.andamal1
    FROM footprints f
""").fetchdf()
con.close()

epc_raw["geometry"] = epc_raw["geom"].apply(lambda b: shapely_wkb.loads(bytes(b)))
epc_gdf = gpd.GeoDataFrame(epc_raw[["FormularId", "andamal1", "geometry"]], crs="EPSG:4326")

# Compute centroids for spatial join (EPC point-in-polygon against EUBUCCO footprints)
epc_gdf["geometry"] = epc_gdf["geometry"].centroid

# Filter EPC to bbox to speed up join
epc_gdf = epc_gdf.cx[LON_MIN:LON_MAX, LAT_MIN:LAT_MAX].copy()
print(f"  EPC footprints in bbox: {len(epc_gdf):,}")

# Spatial join: which EUBUCCO polygon does each EPC centroid fall inside?
gdf_indexed = gdf[["geometry"]].copy()
gdf_indexed.index.name = "eubucco_idx"
joined = gpd.sjoin(epc_gdf, gdf_indexed.reset_index(), how="inner", predicate="within")

# Pick the dominant andamal1 per EUBUCCO building index (most common EPC use)
use_per_building = (
    joined.groupby("eubucco_idx")["andamal1"]
    .agg(lambda x: x.value_counts().index[0])  # mode
    .rename("andamal1_epc")
)
gdf = gdf.join(use_per_building)
print(f"  Matched {use_per_building.notna().sum():,} of {len(gdf):,} buildings to EPC use")

# Assign use category
gdf["use_cat"] = gdf["andamal1_epc"].apply(andamal_to_use)

# ---------------------------------------------------------------------------
# Prepare extrusion height
# Use 'height' if available; fall back to n_floors * 3m
# ---------------------------------------------------------------------------
height_col = None
for c in ["height", "Height", "building_height"]:
    if c in gdf.columns:
        height_col = c
        break

floors_col = None
for c in ["n_floors", "floors", "num_floors"]:
    if c in gdf.columns:
        floors_col = c
        break

print(f"  Height col: {height_col}, Floors col: {floors_col}")

if height_col:
    gdf["elev"] = pd.to_numeric(gdf[height_col], errors="coerce").fillna(0).clip(lower=0)
    # Fallback for zeros using floors
    if floors_col:
        mask = gdf["elev"] == 0
        gdf.loc[mask, "elev"] = pd.to_numeric(gdf.loc[mask, floors_col], errors="coerce").fillna(0) * 3.0
elif floors_col:
    gdf["elev"] = pd.to_numeric(gdf[floors_col], errors="coerce").fillna(0) * 3.0
else:
    gdf["elev"] = 10.0  # fallback flat 10m

# Cap extreme outliers (some EUBUCCO heights are noisy)
p999 = gdf["elev"].quantile(0.999)
gdf["elev"] = gdf["elev"].clip(upper=p999)
print(f"  Height stats: mean={gdf['elev'].mean():.1f}m  median={gdf['elev'].median():.1f}m  p99={gdf['elev'].quantile(0.99):.1f}m  max={gdf['elev'].max():.0f}m")

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
    records.append({
        "coordinates": row["coordinates"],
        "height": float(row["elev"]),
        "color": row["color"],
    })

data_json = json.dumps(records)

# ---------------------------------------------------------------------------
# Compute map centre
# ---------------------------------------------------------------------------
cx = gdf.geometry.centroid.x.median()
cy = gdf.geometry.centroid.y.median()

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
      background:rgba(15,17,23,0.92); border:1px solid rgba(255,255,255,0.12);
      border-radius:8px; padding:10px 14px; font-size:12px; line-height:1.7;
      max-width:240px; display:none;
      box-shadow: 0 4px 16px rgba(0,0,0,0.4);
    }}
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

function showTooltip(info) {{
  if (info.object) {{
    const d = info.object;
    tooltip.style.display = 'block';
    tooltip.style.left = (info.x + 14) + 'px';
    tooltip.style.top  = (info.y + 14) + 'px';
    tooltip.innerHTML =
      '<b style="color:#a78bfa">Building</b><br/>' +
      'Height: <b>' + d.height.toFixed(1) + ' m</b>';
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
</script>
</body>
</html>
"""

os.makedirs("assets", exist_ok=True)
with open(OUTPUT_HTML, "w", encoding="utf-8") as f:
    f.write(html)

file_size_mb = os.path.getsize(OUTPUT_HTML) / 1e6
print(f"\n✅  Saved: {OUTPUT_HTML}  ({file_size_mb:.1f} MB)")
print(f"   Open in a browser:  {os.path.abspath(OUTPUT_HTML)}")
print(f"\nStats:")
print(f"   Buildings : {n_total:,}")
print(f"   Use distribution:\n{gdf['use_cat'].value_counts().to_string()}")
