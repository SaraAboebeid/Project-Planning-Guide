from pathlib import Path
import geopandas as gpd

root = Path(__file__).parent
in_file = root / "data" / "eubucco" / "SE23.gpkg"
out_file = root / "data" / "eubucco" / "SE23.parquet"

if not in_file.exists():
    raise FileNotFoundError(f"Input not found: {in_file}")

print(f"Reading: {in_file}")
gdf = gpd.read_file(in_file)
print(f"Rows: {len(gdf):,}")

print(f"Writing GeoParquet: {out_file}")
gdf.to_parquet(out_file, compression="zstd", index=False)

in_size = in_file.stat().st_size / (1024**3)
out_size = out_file.stat().st_size / (1024**3)
ratio = out_size / in_size if in_size else 0
reduction = (1 - ratio) * 100 if in_size else 0

print(f"Input size:  {in_size:.2f} GB")
print(f"Output size: {out_size:.2f} GB")
print(f"Reduction:   {reduction:.1f}%")
