"""Download EUBUCCO v0.2 building geometry for one city, clipped to its bbox.

Streams the city's NUTS-2 region parquet from EUBUCCO's S3 and keeps only the
buildings intersecting the city bbox (so we pull ~a city, not a whole region).

    python tools/se/download_eubucco_city.py malmo

Writes data/eubucco/<slug>.gpkg (what data_pipeline.py reads for that city).
"""
from __future__ import annotations

import sys
from pathlib import Path

import duckdb
import geopandas as gpd
from pyproj import Transformer

sys.path.insert(0, str(Path(__file__).resolve().parent))
from se_cities import get_city  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent.parent
OUT_DIR = ROOT / "data" / "eubucco"


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    key = sys.argv[1] if len(sys.argv) > 1 else "malmo"
    city = get_city(key)
    nuts = city["nuts2"]
    lo, la, LO, LA = city["bbox4326"]
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out = OUT_DIR / f"{city['slug']}.gpkg"
    if out.exists():
        print(f"[eubucco] {out.name} already exists — skipping download")
        return 0

    # EUBUCCO geometry is EPSG:3035 → transform the bbox to clip in-query.
    t = Transformer.from_crs("EPSG:4326", "EPSG:3035", always_xy=True)
    xs, ys = zip(*[t.transform(x, y) for x, y in [(lo, la), (LO, la), (LO, LA), (lo, LA)]])
    x0, y0, x1, y1 = min(xs), min(ys), max(xs), max(ys)

    con = duckdb.connect()
    con.execute("INSTALL httpfs; LOAD httpfs; INSTALL spatial; LOAD spatial;")
    con.execute("SET s3_endpoint='s3.eubucco.com'; SET s3_url_style='path'; SET s3_use_ssl=false;")
    print(f"[eubucco] {city['name']} — region {nuts}, clipping to bbox {city['bbox4326']}", flush=True)
    df = con.execute(f"""
        SELECT * EXCLUDE geometry, ST_AsWKB(geometry) AS geometry
        FROM 's3://eubucco/v0.2/buildings/parquet/nuts_id={nuts}/{nuts}.parquet'
        WHERE ST_Intersects(geometry, ST_MakeEnvelope({x0}, {y0}, {x1}, {y1}))
    """).fetchdf()
    print(f"[eubucco] {len(df):,} buildings in bbox", flush=True)
    if not len(df):
        print("[eubucco] 0 buildings — check the bbox / region code", file=sys.stderr)
        return 1

    gdf = gpd.GeoDataFrame(df, geometry=gpd.GeoSeries.from_wkb(df["geometry"].apply(bytes)),
                           crs="EPSG:3035")
    gdf.to_file(out, driver="GPKG")
    print(f"[eubucco] saved {out}", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
