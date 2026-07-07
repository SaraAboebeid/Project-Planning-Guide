"""
Fetch OSM green areas for Gothenburg using Nominatim bbox search
and the OSM API directly for small tiles.
"""
import requests, json, time

HDR = {'User-Agent': 'GothenburgGreenStudy/1.0 (github.com/research)'}

# ── 1. Nominatim structured search for parks by amenity tag ──
print("=== Nominatim: leisure=park ===")
tags = [
    ('leisure', 'park'),
    ('leisure', 'nature_reserve'),
    ('landuse', 'grass'),
    ('landuse', 'forest'),
    ('landuse', 'recreation_ground'),
    ('leisure', 'garden'),
]
all_features = []
for key, val in tags:
    time.sleep(1)  # Nominatim rate limit: 1 req/sec
    r = requests.get("https://nominatim.openstreetmap.org/search", params={
        key: val,
        'accept-language': 'en',
        'countrycodes': 'se',
        'viewbox': '11.79,57.60,12.15,57.83',
        'bounded': 1,
        'format': 'geojson',
        'polygon_geojson': 1,
        'limit': 50,
    }, headers=HDR, timeout=12)
    feats = r.json().get('features', [])
    print(f"  {key}={val}: {len(feats)} features  status={r.status_code}")
    all_features.extend(feats)

# Deduplicate by osm_id
seen = set()
unique = []
for f in all_features:
    oid = f['properties'].get('osm_id')
    if oid not in seen:
        seen.add(oid)
        unique.append(f)

print(f"\nTotal unique: {len(unique)}")
for f in unique[:5]:
    geom_type = f['geometry']['type']
    props = f['properties']
    print(f"  {props.get('display_name','')[:60]}  [{geom_type}]")

if unique:
    with open('data/gothenburg_parks_osm.geojson', 'w') as fp:
        json.dump({'type': 'FeatureCollection', 'features': unique}, fp)
    print(f"\nSaved {len(unique)} features to data/gothenburg_parks_osm.geojson")

# ── 2. Try OSM API with a tiny central tile ──
print("\n=== OSM API map (tiny tile) ===")
try:
    r = requests.get("https://api.openstreetmap.org/api/0.6/map",
                     params={'bbox': '11.93,57.69,11.96,57.71'},
                     headers=HDR, timeout=15)
    print(f"Status: {r.status_code}  Length: {len(r.text)} bytes")
    if r.status_code == 200:
        # Count way tags
        park_count = r.text.count('leisure" v="park"')
        print(f"  park ways in tiny tile: {park_count}")
except Exception as e:
    print(f"FAIL: {e}")
