import duckdb
import geopandas as gpd
import pandas as pd
from pathlib import Path

EPC_DB = Path(r"/app/data/sensitivity/epc_sweden.duckdb")

con = duckdb.connect(str(EPC_DB), read_only=True)
row = con.execute("SELECT geom FROM footprints WHERE source='GOT' AND geom IS NOT NULL LIMIT 1").fetchone()
con.close()

raw = bytes(row[0])
print("WKB hex (first 20 bytes):", raw[:20].hex())

# Try to parse as WKB and check bounds
from shapely import wkb
geom = wkb.loads(raw)
print("Geometry type:", geom.geom_type)
print("Centroid:", geom.centroid)
print("Bounds:", geom.bounds)
