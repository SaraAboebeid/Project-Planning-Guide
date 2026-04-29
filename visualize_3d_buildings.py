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

# Building-type colour palette  (R, G, B, A)
TYPE_COLORS = {
    "residential":     [255, 165,  50, 200],   # warm orange
    "commercial":      [ 80, 180, 255, 200],   # sky blue
    "industrial":      [180,  60,  60, 200],   # brick red
    "public":          [ 80, 200, 130, 200],   # teal green
    "mixed":           [200, 130, 255, 200],   # lavender
    "other":           [180, 180, 180, 200],   # grey
    None:              [180, 180, 180, 200],   # grey (unknown)
}

def get_type_color(t):
    if not isinstance(t, str):
        return TYPE_COLORS[None]
    tl = t.lower()
    for k, v in TYPE_COLORS.items():
        if k and k in tl:
            return v
    return TYPE_COLORS[None]

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
# Building type colour
# ---------------------------------------------------------------------------
type_col = next((c for c in ["type", "building_type", "use"] if c in gdf.columns), None)
print(f"  Type col: {type_col}")
if type_col:
    gdf["color"] = gdf[type_col].apply(get_type_color)
else:
    gdf["color"] = [[200, 160, 80, 200]] * len(gdf)

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
n_total     = len(gdf)
h_mean      = gdf["elev"].mean()
h_max       = gdf["elev"].max()
h_median    = gdf["elev"].median()
type_counts = {}
if type_col:
    tc = gdf[type_col].fillna("unknown").str.lower().value_counts().head(6)
    type_counts = tc.to_dict()

type_legend_html = ""
for k, v in TYPE_COLORS.items():
    if k is None:
        continue
    r, g, b, _ = v
    cnt = type_counts.get(k, "")
    cnt_str = f" ({cnt:,})" if isinstance(cnt, int) else (f" ({int(cnt):,})" if cnt else "")
    type_legend_html += f"""
      <div style="display:flex;align-items:center;gap:6px;margin:4px 0">
        <div style="width:14px;height:14px;border-radius:3px;background:rgb({r},{g},{b});flex-shrink:0"></div>
        <span style="text-transform:capitalize">{k}{cnt_str}</span>
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
  <script src="https://unpkg.com/deck.gl@9.0.0/dist.min.js"></script>
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
      border-radius:8px; padding:10px 14px; font-size:12px; line-height:1.6;
      max-width:220px; display:none;
    }}
    #controls {{
      position:absolute; bottom:20px; left:50%; transform:translateX(-50%);
      z-index:10; display:flex; gap:10px;
    }}
    .btn {{
      background:rgba(167,139,250,0.15); border:1px solid rgba(167,139,250,0.4);
      color:#a78bfa; padding:6px 14px; border-radius:6px; cursor:pointer; font-size:12px;
      transition:background 0.2s;
    }}
    .btn:hover {{ background:rgba(167,139,250,0.3); }}
  </style>
</head>
<body>
<div id="map"></div>
<div id="panel">
  <h2>🏙 Gothenburg 3D</h2>
  <div class="sub">EUBUCCO v0.2 · SE23 region</div>
  <div class="stat"><span class="lbl">Buildings shown</span><span class="val">{n_total:,}</span></div>
  <div class="stat"><span class="lbl">Avg height</span><span class="val">{h_mean:.1f} m</span></div>
  <div class="stat"><span class="lbl">Median height</span><span class="val">{h_median:.1f} m</span></div>
  <div class="stat"><span class="lbl">Tallest building</span><span class="val">{h_max:.0f} m</span></div>
  <div class="legend-title">Building type</div>
  <div class="legend">{type_legend_html}</div>
</div>
<div id="tooltip"></div>
<div id="controls">
  <button class="btn" onclick="resetView()">⌂ Reset view</button>
  <button class="btn" onclick="toggleFlat()">⇅ Toggle flat/3D</button>
</div>

<script>
const {{DeckGL, PolygonLayer}} = deck;

const DATA = {data_json};

let is3D = true;
let currentPitch = 50;

const INITIAL_VIEW = {{
  longitude: {cx:.6f},
  latitude:  {cy:.6f},
  zoom: 13,
  pitch: 50,
  bearing: -15,
  transitionDuration: 1000,
}};

const deckgl = new DeckGL({{
  mapStyle: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
  container: 'map',
  initialViewState: INITIAL_VIEW,
  controller: true,
  layers: [buildLayer()],
  getTooltip: ({{object}}) => null,   // handled manually below
  onHover: (info) => showTooltip(info),
}});

function buildLayer() {{
  return new PolygonLayer({{
    id: 'buildings',
    data: DATA,
    pickable: true,
    extruded: is3D,
    wireframe: false,
    getPolygon: d => d.coordinates[0],
    getElevation: d => is3D ? d.height : 0,
    getFillColor: d => d.color,
    getLineColor: [255, 255, 255, 30],
    lineWidthMinPixels: 0,
    elevationScale: 1,
    material: {{
      ambient: 0.35,
      diffuse: 0.7,
      shininess: 32,
      specularColor: [60, 64, 70]
    }},
    transitions: {{
      getElevation: 600,
    }},
    updateTriggers: {{ getElevation: is3D, extruded: is3D }},
  }});
}}

function resetView() {{
  deckgl.setProps({{ initialViewState: {{ ...INITIAL_VIEW, transitionDuration: 800 }} }});
}}

function toggleFlat() {{
  is3D = !is3D;
  deckgl.setProps({{
    layers: [buildLayer()],
    initialViewState: {{
      ...INITIAL_VIEW,
      pitch: is3D ? 50 : 0,
      transitionDuration: 800,
    }},
  }});
}}

const tooltip = document.getElementById('tooltip');
function showTooltip(info) {{
  if (info.object) {{
    const d = info.object;
    tooltip.style.display = 'block';
    tooltip.style.left = (info.x + 12) + 'px';
    tooltip.style.top  = (info.y + 12) + 'px';
    tooltip.innerHTML = `
      <b>Building</b><br/>
      Height: <b>${{d.height.toFixed(1)}} m</b>
    `;
  }} else {{
    tooltip.style.display = 'none';
  }}
}}
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
print(f"   Avg height: {h_mean:.1f} m")
print(f"   Max height: {h_max:.0f} m")
