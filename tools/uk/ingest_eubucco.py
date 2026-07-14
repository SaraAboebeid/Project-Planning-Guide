"""
ingest_eubucco.py - load EUBUCCO UK building attributes for a city's focus area.

EUBUCCO (eubucco.com, CC-BY 4.0, v0.2) is a research database fusing OSM,
Microsoft Building Footprints, and national government registries into building
height/floors/construction-year/type estimates, with confidence bounds and a
per-field source tag. Coverage claims include the UK, but this needed
confirming by hand: the public bucket is organised at NUTS2 granularity (4
characters, e.g. "UKI3"), not the NUTS3 codes (5 characters, e.g. "UKI31")
Wikipedia's NUTS tables give - every NUTS3-keyed URL 404s. Individual rows do
carry their finer NUTS3 `region_id`, so filtering is still precise; only the
per-file *download* granularity is NUTS2.

Download (no API, no token, anonymous S3):
    curl -L -o data/eubucco/UKI3.parquet \\
      https://s3.eubucco.com/eubucco/v0.2/buildings/parquet/nuts_id=UKI3/UKI3.parquet

Files needed per city are listed in cities.py's `eubucco_file`:
    UKI3 - Inner London West  (King's Cross/Camden, Westminster)
    UKI4 - Inner London East  (Tower Hamlets/Canary Wharf, Southwark)
    UKG3 - West Midlands      (Birmingham)
    UKF1 - Derbyshire & Notts (Nottingham)

This module only loads and spatially scopes the data - it does not touch the
geometry rings the viewer draws. OSM's footprints already work and are already
joined to postcode/UPRN for the EPC lookup; EUBUCCO here is an ATTRIBUTE
enrichment (uk_data_pipeline.py matches each OSM building to its nearest
EUBUCCO neighbour and prefers EUBUCCO's height/floors/type where a close match
exists), not a geometry replacement.
"""

from __future__ import annotations

import functools
from pathlib import Path

import geopandas as gpd
from shapely.geometry import Point

ROOT = Path(__file__).resolve().parents[2]
EUBUCCO_DIR = ROOT / "data" / "eubucco"

# EUBUCCO subtype -> this project's use_cat scheme (matches USE_CAT in
# uk_data_pipeline.py, which maps from OSM `building` tag values instead).
SUBTYPE_TO_USE_CAT = {
    "terraced": "bostad_enfamilj",
    "semi-detached": "bostad_enfamilj",
    "detached": "bostad_enfamilj",
    "apartment": "bostad_flerfamilj",
    "commercial": "verksamhet",
    "industrial": "industri",
    "public": "samhalle",
    "agricultural": "industri",
    "others": "ovrigt",
}

_COLUMNS = ["height", "floors", "construction_year", "type", "subtype", "region_id", "geometry"]


@functools.lru_cache(maxsize=8)
def _load_file(filename: str) -> gpd.GeoDataFrame:
    path = EUBUCCO_DIR / filename
    if not path.exists():
        nuts2 = filename.removesuffix(".parquet")
        raise SystemExit(
            f"{path} not found. Download it:\n"
            f"  curl -L -o data/eubucco/{filename} "
            f"https://s3.eubucco.com/eubucco/v0.2/buildings/parquet/nuts_id={nuts2}/{filename}"
        )
    return gpd.read_parquet(path, columns=_COLUMNS)


def load_city_buildings(city: dict) -> gpd.GeoDataFrame:
    """
    EUBUCCO buildings within city['radius_m'] of its centre, reprojected to
    WGS84. Returns an empty GeoDataFrame if the city has no `eubucco_file`
    configured (not yet mapped to a NUTS2 download) - callers should treat
    that as "no enrichment available", not an error.
    """
    filename = city.get("eubucco_file")
    if not filename:
        return gpd.GeoDataFrame(columns=_COLUMNS, geometry="geometry", crs=4326)

    gdf = _load_file(filename)

    # Filter by radius in EUBUCCO's native projected CRS (ETRS89-LAEA, metres) -
    # exact planar distance, and only reprojects the small filtered subset to
    # WGS84 afterward rather than the whole NUTS2 file (100k+ rows).
    center_m = gpd.GeoSeries([Point(city["lon"], city["lat"])], crs=4326).to_crs(gdf.crs).iloc[0]
    margin = 1.3  # a little wider than the OSM cutoff so edge buildings still get a match candidate
    within = gdf[gdf.geometry.centroid.distance(center_m) <= city["radius_m"] * margin]
    return within.to_crs(4326)
