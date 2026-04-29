"""
Download EUBUCCO v0.2 building data for Sweden via DuckDB + S3
"""
import duckdb
import geopandas as gpd
import pandas as pd
from pathlib import Path

# Output directory
DATA_DIR = Path(__file__).parent / "data" / "eubucco"
DATA_DIR.mkdir(parents=True, exist_ok=True)

con = duckdb.connect()
con.execute("INSTALL httpfs; LOAD httpfs;")
con.execute("INSTALL spatial; LOAD spatial;")
con.execute("SET s3_endpoint='s3.eubucco.com';")
con.execute("SET s3_url_style='path';")
con.execute("SET s3_use_ssl=false;")

print("Targeting Gothenburg region (NUTS region SE23 - Västsverige)...")

# Gothenburg is in SE23 (Västsverige / Västra Götalands län)
se_nuts = ["SE23"]

# Step 2: download each region
all_gdfs = []
for nuts_id in se_nuts:
    print(f"\nDownloading {nuts_id}...")
    out_path = DATA_DIR / f"{nuts_id}.gpkg"

    if out_path.exists():
        print(f"  Already exists, skipping: {out_path.name}")
        continue

    try:
        df = con.execute(f"""
            SELECT * EXCLUDE geometry,
                   ST_AsWKB(geometry) AS geometry
            FROM 's3://eubucco/v0.2/buildings/parquet/nuts_id={nuts_id}/{nuts_id}.parquet'
        """).fetchdf()

        print(f"  {len(df):,} buildings downloaded")

        gdf = gpd.GeoDataFrame(
            df,
            geometry=gpd.GeoSeries.from_wkb(df["geometry"].apply(bytes)),
            crs="EPSG:3035",
        )

        gdf.to_file(out_path, driver="GPKG")
        print(f"  Saved to: {out_path}")
        all_gdfs.append(gdf)

    except Exception as e:
        print(f"  ERROR: {e}")

# Step 3: merge all regions into one file
if len(all_gdfs) > 1:
    print("\nMerging all regions into Sweden.gpkg...")
    sweden_gdf = pd.concat(all_gdfs, ignore_index=True)
    sweden_gdf = gpd.GeoDataFrame(sweden_gdf, crs="EPSG:3035")
    sweden_gdf.to_file(DATA_DIR / "Sweden_all.gpkg", driver="GPKG")
    print(f"Merged file: {DATA_DIR / 'Sweden_all.gpkg'} ({len(sweden_gdf):,} buildings)")
elif len(all_gdfs) == 1:
    print(f"\nSingle region downloaded: {len(all_gdfs[0]):,} buildings")

print("\nDone!")
